/* world/nursery.js —— 养成室（局外成长）
   --------------------------------------------------------------------------
   局内系统与局外系统的分界线在这里：
     局内（每局重来）波次、本局击杀、生命、蓄能、场上元件
     局外（一直留着）养成节点、残渣、纪元、自动机、累计击杀、阶跃
   残渣是局外货币，每局结束时按本局表现结算。节点买下即永久生效。
   有些节点买下后要孵一会儿——按真实时间走，关掉页面也在长。

   六个分支：
     根 root   本体底子（厚、薄、快、重）
     枝 branch 掉落与拾取
     脉 vein   培养皿
     环 ring   装配台
     核 core   阶跃与终局
     律 law    纪元——改的是数字本身怎么长

   加一个节点 = 加一项，养成室、卷宗、内置说明自动认领。
   ========================================================================== */
window.MC = window.MC || {};
(function (MC) {
  'use strict';

  var NODES = [
    /* ================= 根 · 本体底子 ================= */
    { id: 'r1', name: '底子',   glyph: '·', branch: 'root', cost: 3,  req: [],      sec: 0,   tier: 1, eff: { hpAdd: 20 },          note: '开局厚一点。' },
    { id: 'r2', name: '厚底',   glyph: '∶', branch: 'root', cost: 12, req: ['r1'],  sec: 40,  tier: 1, eff: { hpAdd: 55 },          note: '再厚一层。' },
    { id: 'r3', name: '锋',     glyph: '∴', branch: 'root', cost: 5,  req: [],      sec: 0,   tier: 1, eff: { dmgAdd: 3 },          note: '开局打得实一点。' },
    { id: 'r4', name: '重锋',   glyph: '∵', branch: 'root', cost: 18, req: ['r3'],  sec: 60,  tier: 1, eff: { dmgAdd: 8 },          note: '实到能压住场面。' },
    { id: 'r5', name: '轻步',   glyph: '⋰', branch: 'root', cost: 8,  req: [],      sec: 0,   tier: 1, eff: { speedAdd: 0.4 },      note: '脚下快半拍。' },
    { id: 'r6', name: '疾',     glyph: '⋱', branch: 'root', cost: 22, req: ['r5'],  sec: 90,  tier: 1, eff: { speedAdd: 0.5, rateMul: 0.94 }, note: '又快又密。' },
    { id: 'r7', name: '韧',     glyph: '⊾', branch: 'root', cost: 26, req: ['r2'],  sec: 120, tier: 2, eff: { hpAdd: 120, shield: 25 },  note: '厚到开始往回弹。' },
    { id: 'r8', name: '锋锐',   glyph: '⋀', branch: 'root', cost: 30, req: ['r4'],  sec: 150, tier: 2, eff: { dmgAdd: 16, critAdd: 0.05 }, note: '打得更尖，也更常打尖。' },
    { id: 'r9', name: '轻身',   glyph: '⋁', branch: 'root', cost: 24, req: ['r6'],  sec: 100, tier: 2, eff: { speedAdd: 0.6, radiusMul: 0.9 }, note: '身子小一圈，判定点跟着缩。' },
    { id: 'r10', name: '不坏',   glyph: '⊘', branch: 'root', cost: 55, req: ['r7'],  sec: 300, tier: 3, eff: { hpAdd: 200, regenAdd: 1.2 },   note: '厚到能自己往回长。' },
    { id: 'r11', name: '极锋',   glyph: '⋂', branch: 'root', cost: 70, req: ['r8'],  sec: 360, tier: 3, eff: { dmgAdd: 34, rateMul: 0.92 },    note: '打得又快又实。' },
    { id: 'r12', name: '虚身',   glyph: '∘', branch: 'root', cost: 60, req: ['r9'],  sec: 300, tier: 3, eff: { hitMul: 0.78, dodge: 0.10 }, note: '判定点缩到 78%，另有 10% 闪避。躲得开是真的——不是把画也画小。' },

    /* ================= 枝 · 掉落与拾取 ================= */
    { id: 'b1', name: '引',     glyph: '∪', branch: 'branch', cost: 4,  req: [],           sec: 0,   tier: 1, eff: { dropMul: 1.25 },   note: '东西掉得勤一点。' },
    { id: 'b2', name: '聚',     glyph: '⊂', branch: 'branch', cost: 16, req: ['b1'],       sec: 60,  tier: 1, eff: { dropMul: 1.5 },    note: '再勤一倍。' },
    { id: 'b3', name: '上位',   glyph: '⊃', branch: 'branch', cost: 30, req: ['b2'],       sec: 180, tier: 2, eff: { outLvBonus: 1 },   note: '更高一级的元件也肯落下来。掉落等级上限整体抬一格。' },
    { id: 'b4', name: '定例',   glyph: '⊇', branch: 'branch', cost: 22, req: ['b1'],       sec: 120, tier: 1, eff: { guaranteed: 1 },  note: '每五波必得一件。' },
    { id: 'b5', name: '广纳',   glyph: '⊆', branch: 'branch', cost: 6,  req: [],           sec: 0,   tier: 1, eff: { magnetAdd: 40 },   note: '捡东西的手长一点。' },
    { id: 'b6', name: '连缀',   glyph: '⋔', branch: 'branch', cost: 34, req: ['b2'],       sec: 150, tier: 2, eff: { twinChance: 0.3 },  note: '掉下来的偶尔是成对的。' },
    { id: 'b7', name: '择精',   glyph: '⋏', branch: 'branch', cost: 40, req: ['b3'],       sec: 200, tier: 2, eff: { outLvBonus: 1, dropMul: 1.2 }, note: '掉得更少，可掉下来的更高一级。' },
    { id: 'b8', name: '不惜',   glyph: '⊛', branch: 'branch', cost: 48, req: ['b4'],       sec: 240, tier: 2, eff: { guaranteed: 1, guaranteed2: 1 }, note: '每五波得两件。' },
    { id: 'b9', name: '巨引',   glyph: '⊕', branch: 'branch', cost: 28, req: ['b5'],       sec: 90,  tier: 1, eff: { magnetAdd: 90 },   note: '手更长。东西自己飞过来。' },
    { id: 'b10', name: '不舍',   glyph: '⊘', branch: 'branch', cost: 66, req: ['b7','b9'], sec: 320, tier: 3, eff: { outLvBonus: 2, magnetAdd: 60 }, note: '上限再抬一格，手也不短。' },

    /* ================= 脉 · 培养皿 ================= */
    { id: 'v1', name: '温',     glyph: '◔', branch: 'vein', cost: 5,  req: [],           sec: 0,   tier: 1, eff: { fuseQuality: 1 },  note: '合成一次就能出结果。不再等。' },
    { id: 'v2', name: '双膛',   glyph: '◕', branch: 'vein', cost: 26, req: ['v1'],       sec: 150, tier: 1, eff: { vatSlots: 1 },     note: '同时开两格。' },
    { id: 'v3', name: '厚养',   glyph: '◖', branch: 'vein', cost: 34, req: ['v1'],       sec: 200, tier: 1, eff: { outLvBonus: 1 },   note: '合成出来的东西更高一级。' },
    { id: 'v4', name: '录',     glyph: '◗', branch: 'vein', cost: 10, req: [],           sec: 0,   tier: 1, eff: { rxRecall: 1 },     note: '跑过的配方直接记在册子上。' },
    { id: 'v5', name: '杂',     glyph: '◘', branch: 'vein', cost: 28, req: ['v1'],       sec: 200, tier: 1, eff: { rxChaos: 1 },      note: '合成开始不按套路出牌。双产出、残渣、空位都变多。' },
    /* vatSlots 走 max(1, 1+v) 语义，所以「三膛」必须写 2 才真的是第三格——
       写 1 会和「双膛」撞成同一个数，那就白买一个节点。 */
    { id: 'v6', name: '三膛',   glyph: '⬴', branch: 'vein', cost: 52, req: ['v2'],       sec: 260, tier: 2, eff: { vatSlots: 2 },     note: '再开一格。' },
    { id: 'v7', name: '通谱',   glyph: '⬵', branch: 'vein', cost: 44, req: ['v4'],       sec: 180, tier: 2, eff: { rxPeek: 1 },      note: '合成之前就能看见会出什么。' },
    { id: 'v8', name: '不舍炉', glyph: '⬶', branch: 'vein', cost: 36, req: ['v1'],       sec: 150, tier: 2, eff: { fuseQuality: 1, outLvBonus: 1 }, note: '合成不掉级，也不多花。' },
    { id: 'v9', name: '催化',   glyph: '⬷', branch: 'vein', cost: 78, req: ['v5','v8'], sec: 380, tier: 3, eff: { outLvBonus: 1, rxChaos: 1, rxPeek: 1 }, note: '又怪又快，而且看得见。' },

    /* ================= 环 · 装配台 ================= */
    { id: 'g1', name: '第七位', glyph: '⑦', branch: 'ring', cost: 40, req: [],           sec: 300, tier: 1, eff: { slots: 1 },        note: '环上多一个位置。六是个对称的数，七不是。' },
    { id: 'g2', name: '紧',     glyph: '⊚', branch: 'ring', cost: 24, req: [],           sec: 120, tier: 1, eff: { synMul: 1.25 },     note: '挨着的两个咬得更深。' },
    { id: 'g3', name: '跨',     glyph: '⊛', branch: 'ring', cost: 36, req: ['g2'],       sec: 240, tier: 2, eff: { synSkip: 1 },       note: '中间空一格也算挨着。「挨着」的定义变了。' },
    { id: 'g4', name: '预置',   glyph: '⊜', branch: 'ring', cost: 18, req: [],           sec: 60,  tier: 1, eff: { presets: 1 },       note: '存三套装配，一键换。' },
    { id: 'g5', name: '环视',   glyph: '⊝', branch: 'ring', cost: 32, req: ['g2'],       sec: 160, tier: 2, eff: { synMul: 1.2, slots: 0 }, note: '整圈一起算。前后左右都算进去。' },
    { id: 'g6', name: '叠位',   glyph: '⊞', branch: 'ring', cost: 58, req: ['g1','g3'], sec: 300, tier: 2, eff: { slots: 1, synSkip: 1 }, note: '八位，并且隔一格也算挨着。' },
    { id: 'g7', name: '共鸣',   glyph: '⊟', branch: 'ring', cost: 46, req: ['g5'],       sec: 220, tier: 2, eff: { synMul: 1.3, synDeep: 1 },  note: '协同咬得更深，而且会往回加成。' },
    { id: 'g8', name: '满环',   glyph: '⬢', branch: 'ring', cost: 88, req: ['g6','g7'], sec: 420, tier: 3, eff: { slots: 1, synMul: 1.25, synDeep: 1 }, note: '九位。环上每一格都占满了。' },

    /* ================= 核 · 阶跃与终局 ================= */
    { id: 'c1', name: '近',     glyph: '⊝', branch: 'core', cost: 20, req: [],           sec: 120, tier: 1, eff: { ladderMul: 0.8 },   note: '阶跃的门槛低一档。走的是乘法，不是减法。' },
    { id: 'c2', name: '敛',     glyph: '⊞', branch: 'core', cost: 12, req: [],           sec: 0,   tier: 1, eff: { residueMul: 1.5 },  note: '结算时多留一把残渣。' },
    { id: 'c3', name: '蓄',     glyph: '⊟', branch: 'core', cost: 15, req: [],           sec: 80,  tier: 1, eff: { chargeStart: 30 },  note: '开局就带着三成蓄能。' },
    { id: 'c4', name: '再起',   glyph: '⊠', branch: 'core', cost: 45, req: ['r2'],       sec: 360, tier: 2, eff: { revive: 1 },       note: '每局倒下时自己站起来一次。站起来那一下，身边一圈清空。' },
    { id: 'c5', name: '望',     glyph: '⊡', branch: 'core', cost: 8,  req: [],           sec: 0,   tier: 1, eff: { wavePeek: 1 },     note: '下一波与下一相提前亮一下。' },
    { id: 'c6', name: '二次再起', glyph: '⊗', branch: 'core', cost: 120, req: ['c4','r10'], sec: 600, tier: 3, eff: { revive: 1, reviveMax: 2 }, note: '一局里能站起来两次。' },
    { id: 'c7', name: '阔',     glyph: '⊞', branch: 'core', cost: 38, req: ['c1'],      sec: 180, tier: 2, eff: { ladderMul: 0.75 }, note: '门槛再低一档。' },
    { id: 'c8', name: '厚积',   glyph: '⊞', branch: 'core', cost: 42, req: ['c2'],      sec: 200, tier: 2, eff: { residueMul: 1.6, residueWave: 1 }, note: '残渣开始跟着波次自己涨。' },
    { id: 'c9', name: '满蓄',   glyph: '⊟', branch: 'core', cost: 36, req: ['c3'],      sec: 160, tier: 2, eff: { chargeStart: 50, chargeRate: 1.4 }, note: '开局半槽，且攒得更快。' },

    /* ================= 律 · 纪元（改的是尺子） ================= */
    { id: 'l1', name: '早律',   glyph: 'Ⅰ', branch: 'law', cost: 30,  req: [],       sec: 120, tier: 1, eff: { epochMul: 0.75 },  note: '纪元的门槛整体压低。' },
    { id: 'l2', name: '厚尺',   glyph: '▤', branch: 'law', cost: 54,  req: ['c7'],    sec: 240, tier: 2, eff: { epochHp: 0.85 },   note: '纪元的「陡律」不再那么陡。' },
    { id: 'l3', name: '留量',   glyph: '⊕', branch: 'law', cost: 62,  req: ['b2'],    sec: 260, tier: 2, eff: { epochRes: 1.5 },   note: '纪元的残渣加成再抬。' },
    { id: 'l4', name: '缓坡',   glyph: '↝', branch: 'law', cost: 80,  req: ['l2'],    sec: 340, tier: 3, eff: { epochHp: 0.8, epochMul: 0.8 }, note: '血量的二次项整体放缓。' },
    { id: 'l5', name: '双纪',   glyph: 'Ⅵ', branch: 'law', cost: 140, req: ['l4','c6'], sec: 600, tier: 4, eff: { epochMul: 0.6, epochHp: 0.75, epochBoss: 0.85 }, note: '门槛、坡度、Boss 三样一起放宽。' },
  ];

  var BY_ID = {};
  NODES.forEach(function (n) { BY_ID[n.id] = n; });

  /* ADD 加进来；MUL 乘上去；FLAG 取大；slots / vatSlots 走 max 语义。
     下面没列出的键一律按 ADD 处理——加节点时不用改这张表。
     rateMul / dropMul / radiusMul / hitMul 只在 MUL 里，它们是乘的。 */
  var ADD = { hpAdd: 0, dmgAdd: 0, speedAdd: 0, magnetAdd: 0, critAdd: 0, shield: 0, regenAdd: 0 };
  var MUL = { rateMul: 1, dropMul: 1, residueMul: 1, synMul: 1, ladderMul: 1, epochMul: 1,
              chargeRate: 1, fuseQuality: 1, epochHp: 1, epochRes: 1, epochBoss: 1,
              radiusMul: 1, hitMul: 1 };
  var FLAG = { synSkip: 0, synDeep: 0, guaranteed: 0, guaranteed2: 0, rxRecall: 0,
               rxChaos: 0, rxPeek: 0, wavePeek: 0, twinChance: 0, dodge: 0,
               revive: 0, reviveMax: 0, chargeStart: 0, residueWave: 0,
               eliteBonus: 0, epochMul2: 0 };

  function blankEffects() {
    var o = { tier: 0 };
    for (var k in ADD) o[k] = ADD[k];
    for (var m in MUL) o[m] = MUL[m];
    for (var f in FLAG) o[f] = FLAG[f];
    o.slots = MC.SLOT_COUNT || 6;
    o.vatSlots = 1;
    return o;
  }

  function st() { return (MC.bus && MC.bus.state) ? MC.bus.state : { nursery: null }; }

  function doneMap() {
    var s = st().nursery;
    return (s && s.done) || {};
  }
  function growMap() {
    var s = st().nursery;
    return (s && s.growing) || {};
  }
  function isDone(id) { return !!doneMap()[id]; }

  /* 孵化剩余秒数。0 = 已成熟。 */
  function growLeft(id) {
    var g = growMap()[id];
    if (!g) return 0;
    var n = BY_ID[id];
    if (!n) return 0;
    var left = n.sec - (Date.now() - g) / 1000;
    return left <= 0 ? 0 : left;
  }

  /* 把孵化完成的收进 done —— 真实时间到了就自己熟 */
  function tick() {
    var s = st();
    if (!s.nursery) return false;
    var g = s.nursery.growing || {};
    var changed = false;
    for (var id in g) {
      if (growLeft(id) <= 0) {
        s.nursery.done[id] = true;
        delete g[id];
        changed = true;
        MC.bus.mark('nursery', '养成 · ' + (BY_ID[id] ? BY_ID[id].name : id) + ' 成熟');
      }
    }
    if (changed) { MC.bus.save(); MC.bus.emit('nursery', s.nursery); }
    return changed;
  }

  function canBuy(id) {
    var n = BY_ID[id];
    if (!n) return null;
    if (isDone(id)) return 'done';
    if (growMap()[id]) return 'growing';
    for (var i = 0; i < n.req.length; i++) if (!isDone(n.req[i])) return 'req';
    if ((st().residue || 0) < n.cost) return 'cost';
    return null;
  }

  function buy(id) {
    var why = canBuy(id);
    if (why) return { ok: false, why: why };
    var s = st(), n = BY_ID[id];
    s.residue -= n.cost;
    if (!s.nursery) s.nursery = { done: {}, growing: {} };
    if (n.sec > 0) s.nursery.growing[id] = Date.now();
    else s.nursery.done[id] = true;
    MC.bus.mark('nursery', '养成 · ' + n.name + (n.sec > 0 ? ' 开始孵化' : ' 立刻生效'));
    MC.bus.save();
    MC.bus.emit('nursery', s.nursery);
    MC.bus.emit('state', s);
    return { ok: true, sec: n.sec };
  }

  /* ---- 汇总：把已成熟节点的 eff 并成一张表 ---- */
  function effects() {
    var o = blankEffects();
    var d = doneMap();
    NODES.forEach(function (n) {
      if (!d[n.id]) return;
      for (var k in n.eff) {
        var v = n.eff[k];
        if (k === 'slots') o.slots = Math.max(o.slots, (MC.SLOT_COUNT || 6) + v);
        else if (k === 'vatSlots') o.vatSlots = Math.max(o.vatSlots, 1 + v);
        else if (k in MUL) o[k] *= v;
        else if (k in FLAG) o[k] = Math.max(o[k], v);
        else o[k] = (o[k] || 0) + v;
      }
    });
    return o;
  }

  function branchOf(b) {
    return NODES.filter(function (n) { return n.branch === b; });
  }

  /* 每局结束后结算残渣：本局击杀与波次都算。residueWave 让它跟着波次涨。 */
  function settle(kills, wave, foundNew) {
    var nu = effects();
    var base = Math.floor((kills || 0) / 40) + (wave || 0) * 2 + (foundNew || 0) * 3;
    if (nu.residueWave) base = Math.floor(base * (1 + wave / 60));
    var law = (MC.epoch && MC.epoch.laws) ? MC.epoch.laws(st().kills) : null;
    if (law && law.resWave > 1) base = Math.floor(base * law.resWave);
    var got = Math.max(1, Math.round(base * nu.residueMul));
    var s = st();
    s.residue = (s.residue || 0) + got;
    s.residueTotal = (s.residueTotal || 0) + got;
    MC.bus.save();
    return got;
  }

  /* 局内也要能往钱包里放东西：场上的事件走这里。 */
  function grantResidue(n) {
    var s = st();
    var got = Math.max(0, Math.round(n || 0));
    s.residue = (s.residue || 0) + got;
    s.residueTotal = (s.residueTotal || 0) + got;
    MC.bus.save();
    return got;
  }

  /* 各分支的完成度，养成室与卷宗用 */
  function progress() {
    var d = doneMap(), g = growMap(), out = {};
    NODES.forEach(function (n) {
      if (!out[n.branch]) out[n.branch] = { done: 0, total: 0, growing: 0 };
      out[n.branch].total++;
      if (d[n.id]) out[n.branch].done++;
      else if (g[n.id]) out[n.branch].growing++;
    });
    return out;
  }

  MC.NURSERY = NODES;
  MC.BRANCHES = ['root', 'branch', 'vein', 'ring', 'core', 'law'];
  MC.nursery = {
    effects: effects, buy: buy, canBuy: canBuy, tick: tick,
    isDone: isDone, growLeft: growLeft, branchOf: branchOf, settle: settle,
    grantResidue: grantResidue, progress: progress,
    byId: function (id) { return BY_ID[id] || null; }
  };
})(window.MC);
