/* ==========================================================================
   world/anomaly.js —— 随机住在哪里
   --------------------------------------------------------------------------
   随机不是「把数字搅乱」，随机是「同一份规则每一局落在不同的位置上」。
   所以这里四张表全部走派生种子：同编号 + 同局数 = 同一张织构。
   换编号 = 换一整套；重开一局 = 织构重抽，但抽法还是那一种。

     1. WEAVE    每局织构。开局抽两缕，挂满整局。它决定这一局偏哪一边。
     2. EVENTS   当波事件。每波抽一条，只管这一波。

   另：anomaly 元件本身每一局重掷一次数值——它叫异常，就该每一局都不太一样。

   变体（VARIANTS）与掉落方差（ROLLS）已删除：
     · 变体是「看不见的百分比堆叠」，十个叠满之后玩家认不出场上的东西，
       这一层已经由 world/waves.js 的精化（ELITES）接管——徽记看得见，可针对。
     · 掉落方差并进培养皿的合成结果里。掉落现在只出一件，好坏由 rollDrop 决定。

   改这张表前先读：加一缕 = 加一项，引擎、图鉴、内置说明自动认领。
   别在引擎里写 if (weave.id === 'xxx')，要开新效果就在表里开一个字段，
   由引擎那一处统一读。散落的分支是把规则写死的开始。
   ========================================================================== */
window.MC = window.MC || {};
(function (MC) {
  'use strict';

  /* ---- 1. 每局织构 ----
     一局抽两缕。两缕叠在一起，这一局就有一个说不清的偏向。
     w = 权重。mul 类的键一律是「乘上去」，add 类的键一律是「加进来」。 */
  var WEAVE = [
    { id: 'dense',  name: '稠', glyph: '⁘', w: 10, mods: { spawnMul: 1.35 },              note: '这一局的场上更挤。' },
    { id: 'thin',   name: '疏', glyph: '⁙', w: 7,  mods: { spawnMul: 0.7, hpMul: 1.5 },   note: '出得少，可每一个都更沉。' },
    { id: 'quick',  name: '疾', glyph: '⇶', w: 9,  mods: { spdMul: 1.28 },                note: '这一局的东西跑得快。' },
    { id: 'heavy',  name: '顽', glyph: '▩', w: 9,  mods: { hpMul: 1.45 },                 note: '这一局的壳更厚。' },
    { id: 'rich',   name: '丰', glyph: '⊛', w: 8,  mods: { dropMul: 1.6 },                note: '这一局掉得多。' },
    { id: 'jitter', name: '歧', glyph: '⁝', w: 7,  mods: { dropJitter: 0.5, outLv: 1 },    note: '这一局掉出来的东西不走寻常路。' },
    { id: 'wane',   name: '蚀', glyph: '◧', w: 6,  mods: { wane: 1 },                     note: '这一局的场地一直在缩。' },
    { id: 'loud',   name: '喧', glyph: '≡', w: 6,  mods: { drifts: 1 },                   note: '这一局的场上多几道墙。' },
    { id: 'jam',    name: '偏', glyph: '≋', w: 6,  mods: { jam: 1 },                      note: '这一局的弹道自己会拐。' },
    { id: 'again',  name: '复', glyph: '♺', w: 5,  mods: { respawn: 0.1 },                note: '这一局死掉的东西会再长一遍。' },
    { id: 'mirror', name: '映', glyph: '⧗', w: 4,  mods: { mirrorChance: 0.25 },          note: '这一局的东西进场时带着自己的影子。' },
    { id: 'plate',  name: '甲', glyph: '▤', w: 4,  mods: { plateChance: 0.4 },            note: '这一局的第一下多半打不动。' }
  ];

  /* ---- 2. 当波事件 ----
     每波抽一条，只管这一波。有的波抽不到——空也是一条结果。
     spawn: 'bunch' 一波全涌上来 / 'sparse' 撒得极稀 / 'fast' 出得极快 —— 改的是时刻表，不是数量。 */
  var EVENTS = [
    { id: 'surge',  name: '涌',   glyph: '⇈', w: 10, min: 3, spawn: 'bunch',  mods: {},                        note: '这一波一起上来。' },
    { id: 'rare',   name: '稀',   glyph: '⋯', w: 6,  min: 3, spawn: 'sparse', mods: { dropMul: 2.2 },          note: '这一波没什么东西，可掉得多。' },
    { id: 'fast',   name: '密',   glyph: '⇶', w: 8,  min: 3, spawn: 'fast',   mods: {},                        note: '这一波出得比往常快。' },
    { id: 'iron',   name: '铁',   glyph: '▤', w: 7,  min: 6,                  mods: { plateChance: 1 },        note: '这一波全体带着壳。' },
    { id: 'glass',  name: '镜',   glyph: '⧗', w: 5,  min: 8,                  mods: { mirrorChance: 0.6 },     note: '这一波每个都带着影子。' },
    { id: 'rain',   name: '雨',   glyph: '☂', w: 6,  min: 10,                 mods: { rain: 1 },               note: '这一波天上有东西下来。' },
    { id: 'silent', name: '喑',   glyph: '⊘', w: 5,  min: 12,                 mods: { silent: 1 },             note: '这一波谁也不出声。' },
    { id: 'rot',    name: '朽',   glyph: '⊜', w: 5,  min: 15,                 mods: { rot: 1 },                note: '这一波站着不动会烂。' },
    { id: 'gild',   name: '镀',   glyph: '✦', w: 5,  min: 5,                  mods: { dropMul: 1.8, outLv: 1 },note: '这一波掉的东西成色高。' },
    { id: 'swell',  name: '胀',   glyph: '◍', w: 6,  min: 9,                  mods: { hpMul: 1.6, spdMul: 0.85 }, note: '这一波又沉又慢。' },
    { id: 'thin',   name: '刃',   glyph: '⟢', w: 6,  min: 7,                  mods: { hpMul: 0.7, spdMul: 1.35 }, note: '这一波薄，可快。' },
    { id: 'well',   name: '井',   glyph: '◎', w: 4,  min: 14,                 mods: { well: 1 },                note: '这一波场上多了一口井。' }
  ];

  /* ---- 3. 掉落 ----
     旧版这里有第四张表 ROLLS（掉几个、成色高几级、或者掉一把渣）。
     它已删除：掉落现在只出一件，是什么由 rollDrop 的权重决定。
     残渣仍会从别处来（波相「丰」、合成出渣、纪元 resWave），但不再掷一次骰子。 */

  /* ---- 单点收敛：织构 / 事件 / 波相的数值都从这里出 ----
     引擎只读 weave.mods + event.mods + phase.mods 合成的 rule，不认 id。
     加一缕 = 加一个键 + 引擎那一处读一次。 */
  var KEYS = ['spawnMul', 'spdMul', 'hpMul', 'rMul', 'dropMul', 'dropJitter', 'outLv',
              'respawn', 'mirrorChance', 'plateChance', 'wane', 'drifts', 'jam',
              'rain', 'silent', 'rot', 'well',
              /* 波相带来的：见 world/waves.js 的 phaseMods */
              'waveTighten', 'wallHp', 'zoneHp', 'slowZones', 'drain', 'mist',
              'bossEvery', 'bossHp', 'eliteChance'];
  var MUL_KEYS = ['spawnMul', 'spdMul', 'hpMul', 'rMul', 'dropMul',
                  'waveTighten', 'wallHp', 'zoneHp', 'drain', 'bossEvery', 'bossHp', 'eliteChance'];
  var FLAGS = ['wane', 'drifts', 'jam', 'rain', 'silent', 'rot', 'well', 'slowZones', 'mist'];

  function unit() {
    var o = {};
    for (var i = 0; i < KEYS.length; i++) {
      o[KEYS[i]] = (MUL_KEYS.indexOf(KEYS[i]) >= 0) ? 1 : 0;
    }
    /* 波相表里没写的键给中性值，避免 undefined 参与乘法 */
    o.bossEvery = 10;
    return o;
  }

  function merge(dst, mods) {
    if (!mods) return dst;
    for (var k in mods) {
      if (!(k in dst)) continue;
      var isMul = MUL_KEYS.indexOf(k) >= 0;
      if (isMul && dst[k] === 10 && k === 'bossEvery') dst[k] = 10;
      dst[k] = isMul ? dst[k] * mods[k] : dst[k] + mods[k];
    }
    return dst;
  }

  function pickW(rng, table, filter) {
    var pool = filter ? table.filter(filter) : table;
    if (!pool.length) return null;
    var total = 0, i;
    for (i = 0; i < pool.length; i++) total += pool[i].w;
    var r = rng() * total;
    for (i = 0; i < pool.length; i++) { r -= pool[i].w; if (r <= 0) return pool[i]; }
    return pool[pool.length - 1];
  }

  /* ---- 织构：一局抽两缕，整局挂满 ---- */
  function rollWeave(seed, runToken) {
    var rng = MC.seed.rngFrom(seed, 'weave' + (runToken || 0));
    var a = pickW(rng, WEAVE);
    var b = pickW(rng, WEAVE.filter(function (x) { return !a || x.id !== a.id; }));
    var mods = unit();
    merge(mods, a && a.mods);
    merge(mods, b && b.mods);
    var picks = [a, b].filter(Boolean);
    return {
      picks: picks,
      glyphs: picks.map(function (p) { return p.glyph; }),
      names: picks.map(function (p) { return p.name; }),
      notes: picks.map(function (p) { return p.note; }),
      mods: mods
    };
  }

  /* ---- 当波事件：每波一条，也可能没有 ---- */
  function waveEvent(seed, wave, runToken) {
    if (wave < 3) return null;
    var rng = MC.seed.rngFrom(seed, 'event' + wave + '_' + (runToken || 0));
    /* 越往后越容易撞上：前中期留白多，后期每一波都有说法 */
    var chance = 0.35 + Math.min(0.55, wave * 0.012);
    if (rng() > chance) return null;
    var d = pickW(rng, EVENTS, function (x) { return (x.min || 0) <= wave; });
    if (!d) return null;
    var mods = unit();
    merge(mods, d.mods);
    return { def: d, name: d.name, glyph: d.glyph, note: d.note, spawn: d.spawn || null, mods: mods };
  }

  /* ---- 掉落：只出一件。是什么由 rollDrop 的权重决定，这里不再掷骰子。 ----
     旧版的 ROLLS 表（掉几个 / 成色高几级 / 掉一把渣）已删除。 */

  /* ---- 异常元件：每一局重掷一次 ----
     它叫异常，就该每一局都不太一样。重掷由引擎在开局时发起。 */
  var ANOMALY_POOL = [
    { key: 'dmg',   lo: 6,   hi: 30 },
    { key: 'crit',  lo: 0.04, hi: 0.30 },
    { key: 'rateMul', lo: 0.72, hi: 1.02, mul: 1 },
    { key: 'hp',    lo: -25, hi: 70 },
    { key: 'pierce', lo: 0, hi: 3 },
    { key: 'blast', lo: 0, hi: 40 },
    { key: 'chain', lo: 0, hi: 3 },
    { key: 'orbit', lo: 0, hi: 3 },
    { key: 'speed', lo: 0, hi: 1.6 },
    { key: 'magnet', lo: 0, hi: 80 }
  ];

  var live = null;

  function rerollAnomaly(seed, runToken) {
    var rng = MC.seed.rngFrom(seed, 'ano' + (runToken || 0));
    var out = {};
    for (var i = 0; i < ANOMALY_POOL.length; i++) {
      var p = ANOMALY_POOL[i];
      /* 五项里挑，所以每一局的异常只长在一小片上——不是全能，是偏 */
      if (rng() > 0.45) continue;
      var v = p.lo + (p.hi - p.lo) * rng();
      if (p.mul) out[p.key] = 1 - (1 - v) * 1;
      else if (p.key === 'crit') out[p.key] = Math.round(v * 100) / 100;
      else if (p.key === 'pierce' || p.key === 'chain' || p.key === 'orbit') out[p.key] = Math.round(v);
      else out[p.key] = Math.round(v * 10) / 10;
    }
    live = out;
    return out;
  }

  function anomalyMods() { return live || {}; }

  MC.ANOMALY = { WEAVE: WEAVE, EVENTS: EVENTS };
  MC.anomaly = {
    unit: unit, merge: merge, pickW: pickW,
    rollWeave: rollWeave, waveEvent: waveEvent,
    rerollAnomaly: rerollAnomaly, anomalyMods: anomalyMods,
    KEYS: KEYS, MUL_KEYS: MUL_KEYS, FLAGS: FLAGS
  };
})(window.MC);
