/* ==========================================================================
   world/epoch.js —— 纪元（律）
   --------------------------------------------------------------------------
   阶跃改的是「场上会发生什么」，纪元改的是「数字本身怎么长」。

   阶跃跨过门槛，世界换一条规则；纪元跨过门槛，尺子换一把。
   所以旧存档里的「伤害 40」到了新纪元不再等于旧纪元的「伤害 40」——
   数量级上去以后，原来那个数就不再是原来那个意思。

   律的键只有这七个，全部是乘算。引擎只读这张表，不认 id。
   加一个纪元 = 加一项，序室、卷宗、内置说明自动认领。
   ========================================================================== */
window.MC = window.MC || {};
(function (MC) {
  'use strict';

  /* 律的键。全部乘算，1 = 不改。
     hpWave   敌人血量随波次增长的二次项系数（越大越陡）
     dropWave 掉落的波次项（越大越富）
     rateWave 开火间隔的波次项（越大越慢）
     resWave  残渣结算的波次项
     bossWave Boss 血量的波次项
     waveGain 每波时长的增长项（越大越拖）
     edge     收边强度：0 = 不收边，1 = 照常收，>1 = 收得更狠 */
  var LAW_KEYS = ['hpWave', 'dropWave', 'rateWave', 'resWave', 'bossWave', 'waveGain', 'edge'];

  var EPOCHS = [
    {
      id: 'e0', at: 0, name: '初律', glyph: '〇', good: true,
      note: '还没开始换尺子。这一段的数就是它字面上的意思。',
      laws: {}
    },
    {
      id: 'e1', at: 3000, name: '陡律', glyph: 'Ⅰ', good: false,
      note: '血量开始二次长。堆伤害从此不够，得改结构。',
      laws: { hpWave: 1.22 }
    },
    {
      id: 'e2', at: 12000, name: '富律', glyph: 'Ⅱ', good: true,
      note: '掉落跟着长。杀得多拿得多，账开始自己转起来。',
      laws: { dropWave: 1.30, resWave: 1.2 }
    },
    {
      id: 'e3', at: 45000, name: '滞律', glyph: 'Ⅲ', good: false,
      note: '开火间隔开始拉长。手里的东西变多了，出的手变慢了。',
      laws: { rateWave: 0.86, hpWave: 1.12 }
    },
    {
      id: 'e4', at: 150000, name: '广律', glyph: 'Ⅳ', good: true,
      note: '一波的时间变长。留给你改系统的那段变长了。',
      laws: { waveGain: 1.35, resWave: 1.25 }
    },
    {
      id: 'e5', at: 500000, name: '收律', glyph: 'Ⅴ', good: false,
      note: '场地开始真的收。可走的地方按纪元往下掉。',
      laws: { edge: 1.8, hpWave: 1.18 }
    },
    {
      id: 'e6', at: 1500000, name: '沉律', glyph: 'Ⅵ', good: false,
      note: 'Boss 与残渣一起变重。这个数量级上，快已经不算优势了。',
      laws: { bossWave: 1.5, resWave: 1.4, hpWave: 1.15 }
    },
    {
      id: 'e7', at: 5000000, name: '尽律', glyph: 'Ⅶ', good: false,
      note: '上面所有律同时在场。原来那个数已经不再表示原来那件事。',
      laws: { hpWave: 1.30, dropWave: 1.2, rateWave: 0.90, resWave: 1.3, waveGain: 1.2, edge: 1.4, bossWave: 1.35 }
    }
  ];

  function mul() {
    var nu = (MC.nursery && MC.nursery.effects) ? MC.nursery.effects() : null;
    return (nu && nu.epochMul) ? nu.epochMul : 1;
  }

  function atOf(i) {
    var e = EPOCHS[i];
    return e ? Math.round(e.at * mul()) : Infinity;
  }

  function idxOf(kills) {
    var k = kills || 0, i = 0;
    while (i + 1 < EPOCHS.length && k >= atOf(i + 1)) i++;
    return i;
  }

  /* 当前纪元带来的全部律。未到的只露门槛。
     全部键都是乘算，中性值一律 1——包括 edge。
     edge 的中性值是 1 而不是 0：它乘在一个「收边系数」上，
     1 = 照常收，>1 = 收得更狠，<=1 视为不收。
     早先把它初始化成 0 再乘，结果永远是 0——乘算的键不能从 0 起。 */
  function laws(kills) {
    var o = {};
    LAW_KEYS.forEach(function (k) { o[k] = 1; });
    for (var i = 0; i <= idxOf(kills); i++) {
      var l = (EPOCHS[i] || {}).laws || {};
      for (var k in l) if (o[k] != null) o[k] *= l[k];
    }
    return o;
  }

  function at(i) { return EPOCHS[i] || null; }
  function next(kills) { return EPOCHS[idxOf(kills) + 1] || null; }
  function cur(kills) { return EPOCHS[idxOf(kills)] || EPOCHS[0]; }
  function reached(kills) {
    return EPOCHS.filter(function (e) { return (kills || 0) >= atOf(EPOCHS.indexOf(e)); });
  }
  function progressTo(kills) {
    var i = idxOf(kills), nx = EPOCHS[i + 1];
    if (!nx) return 1;
    var prev = atOf(i), goal = atOf(i + 1);
    return Math.max(0, Math.min(1, ((kills || 0) - prev) / (goal - prev)));
  }

  /* 到了才亮。没到的一层只给门槛数字。 */
  function peek(e, kills) {
    var i = EPOCHS.indexOf(e);
    var got = (kills || 0) >= atOf(i);
    var L = {};
    LAW_KEYS.forEach(function (k) { L[k] = 1; });
    if (got) for (var k in e.laws) L[k] = e.laws[k];
    return {
      id: e.id, at: atOf(i), glyph: got ? e.glyph : '？', name: got ? e.name : '？',
      note: got ? e.note : '', good: e.good, got: got, laws: L
    };
  }

  MC.EPOCHS = EPOCHS;
  MC.LAW_KEYS = LAW_KEYS;
  MC.epoch = {
    idxOf: idxOf, laws: laws, at: at, atOf: atOf, next: next, cur: cur,
    reached: reached, progressTo: progressTo, peek: peek
  };
})(window.MC);
