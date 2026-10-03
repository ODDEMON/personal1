/* core/bus.js —— 存档与联动总线
   房间之间一律不互相 import，全走这里。
   三条通道：同源广播 / 父子消息 / 聚焦重读，能走哪条走哪条。 */
window.MC = window.MC || {};
(function (MC) {
  'use strict';

  var KEY = 'microcosm_v1';
  var CHANNEL = 'microcosm-v1';
  var HOP_MAX = 3;

  /* 局外与局内分开摆：下面标了 [局外] 的，只有「硬重置」会清掉 */
  function blank() {
    return {
      seed: 0,
      /* ---- 局外：一直留着 ---- */
      kills: 0,              /* [局外] 累计击杀 —— 阶跃与纪元只认这一个数 */
      residue: 0,            /* [局外] 未花掉的残渣 */
      residueTotal: 0,       /* [局外] 历史累计残渣 */
      found: {},             /* [局外] moduleId -> true（点亮了就永远亮着） */
      seen: {},              /* [局外] 见过的敌人 kindId -> true */
      /* [局外] 元件库存。注意语义：**未装配**的元件数。
         装进 rig 的那几件从库存里扣掉，卸下来时还回来。
         引擎每局结束会把 inventory 清空——元件是局内资源，局外留下的是
         残渣、养成、纪元、阶跃。这一条是「合成有意义」的前提。 */
      inventory: {},
      rig: [null, null, null, null, null, null, null],
      presets: {},           /* [局外] 预置装配（养成室 g4 解锁） */
      culture: [],           /* [局外] 培养皿格子 */
      knownRx: {},           /* [局外] 'a+b' -> 产物 id，只记跑通过的 */
      nursery: { done: {}, growing: {} },
      bestWave: 0,           /* [局外] */
      runs: 0,               /* [局外] */
      ladderTier: 0,
      prefs: null,           /* [局外] 皮肤 / 风格 / 瞄准 / 特效，由 core/cosmetics.js 填 */
      __invMigrated: false,  /* 库存语义从「总数」迁到「未装配数」做过没有 */
      calm: false,
      sound: false,
      log: []
    };
  }

  /* 旧存档的形状校正。加字段时在这里补一条，老进度就还能开。 */
  function migrate(b) {
    /* knownRx 曾经只记 true，现在记产物 */
    var rx = b.knownRx;
    if (rx && typeof rx === 'object') {
      for (var k in rx) if (rx[k] === true || rx[k] == null) rx[k] = { out: [], residue: 0 };
    }
    /* culture 曾经是单个炉膛，现在是一排 */
    if (b.culture && !Array.isArray(b.culture)) b.culture = [b.culture];
    if (b.culture == null) b.culture = [];
    /* rig 可能比槽位短 */
    if (!Array.isArray(b.rig)) b.rig = blank().rig;
    while (b.rig.length < 7) b.rig.push(null);
    if (!b.nursery || !b.nursery.done) b.nursery = { done: b.nursery && b.nursery.done ? b.nursery.done : {}, growing: {} };
    if (!b.seen) b.seen = {};
    /* 自动机这一层已经整层删掉了：老存档里留着的那一块直接摘掉，
       免得它一直躺在存档里当一个没人读的键。 */
    delete b.automata;
    delete b.codes;
    if (!b.prefs || typeof b.prefs !== 'object') b.prefs = MC.cosmetics ? MC.cosmetics.blankPrefs() : null;
    if (b.prefs && !b.prefs.skin) b.prefs.skin = 'ink';
    if (b.prefs && !b.prefs.style) b.prefs.style = 'plain';

    /* 旧存档的 inventory 记的是「总数」（含装在 rig 上的）。
       新语义是「未装配数」，所以这里把 rig 上占着的那些扣掉。
       扣完可能为负——夹到 0。那是旧存档，扣不动的那几件就当它一直装着。 */
    if (b.__invMigrated) return;
    var used = {};
    (b.rig || []).forEach(function (id) { if (id) used[id] = (used[id] || 0) + 1; });
    for (var id2 in used) {
      b.inventory[id2] = (b.inventory[id2] || 0) - used[id2];
      if (b.inventory[id2] <= 0) delete b.inventory[id2];
    }
    b.__invMigrated = true;
  }

  var state = blank();
  var subs = {};
  var channel = null;

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return false;
      var o = JSON.parse(raw);
      if (o && typeof o === 'object') {
        var b = blank();
        for (var k in b) if (o[k] != null) b[k] = o[k];
        migrate(b);
        /* 就地写字段，不整体替换：房间们抓走了这个对象的引用 */
        for (var j in b) state[j] = b[j];
      }
      return true;
    } catch (e) { return false; }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
    catch (e) { return false; }
  }

  function reset() {
    var b = blank();
    for (var k in b) state[k] = b[k];
    save();
    emit('state', state);
  }

  function on(k, fn) { (subs[k] = subs[k] || []).push(fn); return fn; }
  function off(k, fn) { var a = subs[k] || [], i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }

  function local(k, payload) {
    (subs[k] || []).slice().forEach(function (f) {
      try { f(payload); } catch (e) { /* 一个订阅者出错不牵连其余 */ }
    });
  }

  function outward(k, payload) {
    var msg = { __mc: 1, type: 'bus', k: k, payload: payload, hop: 1 };
    try {
      if (window.parent && window.parent !== window) window.parent.postMessage(msg, '*');
    } catch (e) { /* 顶层窗口 */ }
    try {
      var fs = document.querySelectorAll('iframe[data-room]');
      for (var i = 0; i < fs.length; i++) {
        if (fs[i].contentWindow) fs[i].contentWindow.postMessage(msg, '*');
      }
    } catch (e) { /* 房间窗口 */ }
    try { if (channel) channel.postMessage(msg); } catch (e) { /* 通道缺席 */ }
  }

  function emit(k, payload) { local(k, payload); outward(k, payload); }

  function ingest(msg) {
    if (!msg || msg.__mc !== 1 || msg.type !== 'bus') return;
    if (msg.hop > HOP_MAX) return;
    local(msg.k, msg.payload);
  }

  function sync() {
    var before = JSON.stringify(state);
    load();
    if (JSON.stringify(state) !== before) local('state', state);
  }

  /* 暂停是全局的：房间窗口里按 P / Esc 也要算数，
     所以这里统一转发给父窗口，由总台决定怎么落地。 */
  window.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    var k = e.key;
    if (k !== 'p' && k !== 'P' && k !== 'Escape') return;
    local('hotkey', 'pause');
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ __mc: 1, type: 'pause' }, '*');
      }
    } catch (err) { /* 顶层窗口 */ }
  });

  window.addEventListener('message', function (e) {
    var d = e && e.data;
    if (!d || d.__mc !== 1) return;
    if (d.type === 'bus') { ingest(d); return; }
    if (d.type === 'goto' && typeof d.id === 'string') local('goto', d.id);
    if (d.type === 'toast' && typeof d.text === 'string') local('toast', d.text);
    if (d.type === 'hello') local('hello', d.id);
    if (d.type === 'pause') local('hotkey', 'pause');
  });

  window.addEventListener('storage', function (e) { if (e && e.key === KEY) sync(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) sync(); });
  window.addEventListener('focus', sync);

  try {
    if (typeof BroadcastChannel === 'function') {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = function (e) { if (e && e.data) ingest(e.data); };
    }
  } catch (e) { channel = null; }

  function askGoto(id) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ __mc: 1, type: 'goto', id: id }, '*');
      }
    } catch (e) { /* 独立打开 */ }
  }
  function toast(text) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ __mc: 1, type: 'toast', text: text }, '*');
      }
    } catch (e) { /* 同上 */ }
    local('toast', text);
  }
  function hello() {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ __mc: 1, type: 'hello', id: location.pathname.split('/').pop() }, '*');
      }
    } catch (e) { /* 顶层 */ }
  }
  if (document.readyState === 'complete') hello();
  else window.addEventListener('load', hello);

  function mark(who, what) {
    state.log.push({ t: Date.now(), who: who, what: what });
    if (state.log.length > 200) state.log.shift();
    save();
    emit('log', state.log);
  }

  /* ---- 派生读数 ---- */
  function foundCount() { return Object.keys(state.found).length; }

  /* ---- 元件库存：唯一写入口 ----
     语义是「未装配的件数」。装上 rig 扣一个，卸下来还一个，
     合成一次扣两个、产出一个。所有房间都走这三个函数，别直接改 state.inventory。 */
  function invAdd(id, n) {
    if (!id) return 0;
    n = n || 1;
    state.inventory[id] = (state.inventory[id] || 0) + n;
    if (state.inventory[id] <= 0) delete state.inventory[id];
    return state.inventory[id] || 0;
  }
  function invTake(id, n) {
    if (!id) return false;
    n = n || 1;
    if ((state.inventory[id] || 0) < n) return false;
    state.inventory[id] -= n;
    if (state.inventory[id] <= 0) delete state.inventory[id];
    return true;
  }
  function invCount(id) { return state.inventory[id] || 0; }
  function invTotal() {
    var t = 0;
    for (var k in state.inventory) t += state.inventory[k] || 0;
    return t;
  }
  /* 每局结束：未装配的元件全部退回熔炉。装配、点亮、残渣留着。 */
  function invClearRun() {
    var n = invTotal();
    state.inventory = {};
    return n;
  }

  /* 阶跃：只认累计击杀这一个数。门槛表在 world/ladder.js，这里只做转发。 */
  function tierOf(kills) {
    return (MC.ladder && MC.ladder.tierOf) ? MC.ladder.tierOf(kills) : 0;
  }

  /* 局外清空的那一半：培养皿、养成、残渣、库存、装配全没。
     编号与设置（冷静 / 声轨 / 皮肤 / 风格）留着——那是人的偏好，不是存档。 */
  function wipeMeta() {
    var keep = { seed: state.seed, calm: state.calm, sound: state.sound, prefs: state.prefs };
    var b = blank();
    for (var k in b) state[k] = b[k];
    state.seed = keep.seed; state.calm = keep.calm; state.sound = keep.sound;
    state.prefs = keep.prefs;
    save();
    emit('state', state);
    emit('nursery', state.nursery);
  }

  MC.bus = {
    KEY: KEY,
    get state() { return state; },
    load: load, save: save, reset: reset, wipeMeta: wipeMeta, sync: sync,
    on: on, off: off, emit: emit,
    askGoto: askGoto, toast: toast, hello: hello, mark: mark,
    foundCount: foundCount, tierOf: tierOf,
    invAdd: invAdd, invTake: invTake, invCount: invCount, invTotal: invTotal,
    invClearRun: invClearRun
  };
})(window.MC);
