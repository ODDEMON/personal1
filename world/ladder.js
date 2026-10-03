/* world/ladder.js —— 阶跃
   --------------------------------------------------------------------------
   累计击杀跨过一道门槛，规则本身换一条。八级里有四级是压力，不是奖励——
   数量级上去以后，世界也会变。

   门槛是可走到的：一局几百到几千杀，攒几十局能摸到后面几级。
   养成室的「近」会把所有门槛整体压低一档。

   未到的那一层只露出门槛数字，名字与效果留白 —— 到了才亮。
   ========================================================================== */
window.MC = window.MC || {};
(function (MC) {
  'use strict';

  var LADDER = [
    { tier: 1, at: 150,    name: '富集', glyph: '⊕', good: true,  note: '掉落多一倍。世界开始给得多。' },
    { tier: 2, at: 600,    name: '贯穿', glyph: '↠', good: true,  note: '所有弹丸都能多穿一个。' },
    { tier: 3, at: 2000,   name: '副炮', glyph: '◎', good: true,  note: '核心外多一座自动炮。它自己选目标。' },
    { tier: 4, at: 6000,   name: '再生', glyph: '♺', good: false, note: '击杀后有概率再长出一个。数量开始有自己的意见。' },
    { tier: 5, at: 16000,  name: '生态', glyph: '⊗', good: false, note: '场上的东西开始互相吃。吃掉的那一方变大，这一份不算你的。' },
    { tier: 6, at: 40000,  name: '重叠', glyph: '⧗', good: false, note: '进场时可能带镜像。同一个东西同时在两个地方。' },
    { tier: 7, at: 100000, name: '侵蚀', glyph: '⊘', good: false, note: '你一直在掉血。活下去从此要靠吸血，不靠躲。' },
    { tier: 8, at: 250000, name: '终末', glyph: '◈', good: false, note: '上面所有规则同时在场。十张牌一次翻完。' }
  ];

  /* 养成室「近」：门槛整体乘一个系数 */
  function mul() {
    var nu = (MC.nursery && MC.nursery.effects) ? MC.nursery.effects() : null;
    return (nu && nu.ladderMul) ? nu.ladderMul : 1;
  }

  function atOf(tier) {
    var l = LADDER.filter(function (x) { return x.tier === tier; })[0];
    return l ? Math.round(l.at * mul()) : Infinity;
  }

  function tierOf(kills) {
    var t = 0, k = kills || 0;
    while (t < LADDER.length && k >= Math.round(LADDER[t].at * mul())) t++;
    return t;
  }

  function at(tier) { return LADDER.filter(function (l) { return l.tier === tier; })[0] || null; }
  function reached(kills) {
    return LADDER.filter(function (l) { return (kills || 0) >= Math.round(l.at * mul()); });
  }
  function next(kills) {
    var t = tierOf(kills);
    return LADDER[t] || null;
  }
  function progressTo(kills) {
    var t = tierOf(kills);
    var n = LADDER[t];
    if (!n) return 1;
    var prev = t > 0 ? Math.round(LADDER[t - 1].at * mul()) : 0;
    var goal = Math.round(n.at * mul());
    return Math.max(0, Math.min(1, ((kills || 0) - prev) / (goal - prev)));
  }

  /* 到了才亮：没到的一层只给门槛数字 */
  function peek(l, kills) {
    var got = (kills || 0) >= Math.round(l.at * mul());
    return {
      tier: l.tier, at: Math.round(l.at * mul()),
      glyph: got ? l.glyph : '？',
      name: got ? l.name : '？',
      note: got ? l.note : '',
      good: l.good, got: got
    };
  }

  /* 当前阶跃带来的全局修正与开关 */
  function effects(kills) {
    var t = tierOf(kills);
    return {
      tier: t,
      dropMul: t >= 1 ? 2 : 1,
      pierceAdd: t >= 2 ? 1 : 0,
      autoTurret: t >= 3 ? 1 : 0,
      respawnChance: t >= 4 ? 0.12 : 0,
      devour: t >= 5,
      mirrorChance: t >= 6 ? 0.3 : 0,
      decay: t >= 7 ? 1.1 : 0,     /* 每秒掉血 */
      allRules: t >= 8
    };
  }

  function fmt(n) {
    if (n < 1000) return String(Math.floor(n));
    var u = ['', 'K', 'M', 'G', 'T', 'P', 'E', 'Z'];
    var i = 0, v = n;
    while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; }
    return (v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : String(Math.floor(v))) + u[i];
  }

  MC.LADDER = LADDER;
  MC.ladder = {
    tierOf: tierOf, at: at, atOf: atOf, reached: reached, next: next,
    progressTo: progressTo, effects: effects, fmt: fmt, peek: peek
  };
})(window.MC);
