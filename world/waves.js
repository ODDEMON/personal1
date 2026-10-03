/* world/waves.js —— 波次、波相与 Boss
   --------------------------------------------------------------------------
   旧版每 5 波叠一条永久变异，十条叠满之后场面已经认不出来了。
   那一套整体删除，换成两样东西：

     PHASES 波相　一共五条，按波次依次开。开的越多场面越挤，
                   但条数是封顶的——你始终知道现在有哪几条在生效。
     ELITES 精化　不是新机制，是给某一只东西挂一个看得见的徽记。
                   看得见 = 可以针对；看不见的百分比堆叠就是旧变异失败的根因。

   Boss 保留：多部件、先破件再打芯，位置是唯一的「必须瞄」目标。
   加一个波相 = 加一项，序室、卷宗、内置说明自动认领。 */
window.MC = window.MC || {};
(function (MC) {
  'use strict';

  /* mods 的键与 world/anomaly.js 的 KEYS 同源：mul 类的乘上去，flag 类的加进来。 */
  var PHASES = [
    { id: 'press',  wave: 6,  name: '压', glyph: '⇈', w: 10,
      mods: { spawnMul: 1.30, waveTighten: 0.12 },
      note: '这一波之后，场上一直更挤，出得也更快。' },

    { id: 'harden', wave: 14, name: '硬化', glyph: '▤', w: 9,
      mods: { hpMul: 1.35 },
      note: '壳更厚。第一下打不动的东西变多了。' },

    { id: 'blind',  wave: 24, name: '障', glyph: '⩚', w: 8,
      mods: { wallHp: 0.55, zoneHp: 0.7, mist: 1 },
      note: '视野里多出几道几何障。它挡弹，也挡你的准头。' },

    { id: 'silt',   wave: 36, name: '淤', glyph: '⊜', w: 7,
      mods: { slowZones: 1, drain: 0.9 },
      note: '地上开始留东西。踩着会慢，也会一直掉血。' },

    { id: 'reign',  wave: 50, name: '盛', glyph: '◈', w: 6,
      mods: { bossEvery: 5, bossHp: 1.5, eliteChance: 0.34 },
      note: 'Boss 来得更勤，精化得多。这一波之后每一波都有硬骨头。' }
  ];

  var ELITES = [
    { id: 'quick',  name: '疾', glyph: '›', note: '这只跑得快。看得见的快，不吃暗亏。' },
    { id: 'thick',  name: '厚', glyph: '▣', note: '这只壳厚。慢的打得动它。' },
    { id: 'large',  name: '巨', glyph: '⬣', note: '这只大。打得到的地方更多。' },
    { id: 'small',  name: '微', glyph: '·', note: '这只小。难打中，但好躲。' },
    { id: 'shield', name: '壳', glyph: '⬡', note: '这只外面糊了一层。第一下只走三分伤害。' },
    { id: 'twin',   name: '孖', glyph: '⁂', note: '这只死后分成两只小的。' },
    { id: 'burn',   name: '灼', glyph: '✳', note: '这只死的时候炸一下。' }
  ];
  var ELITE_BY = {};
  ELITES.forEach(function (e) { ELITE_BY[e.id] = e; });

  /* Boss 的攻击模式。旧版六个 Boss 长得不一样、打起来一样——
     都只是「转圈 + 碰你一下」。现在每一只有一套自己的出手：
       ring    一圈一圈往外放
       spiral  一条一直转的螺旋
       beam    朝你划一条线
       summon  一直吐小的
       sweep   横着扫过整个场
       cross   四条正交的线同时放
     部件还在：先破件再打芯，位置仍然是唯一的「必须瞄」目标。 */
  var BOSSES = [
    { id: 'b1', name: '三环',   parts: 3,  hp: 260,  glyph: '⊛', hue: 8,   ai: 'ring',   note: '一圈一圈往外放。' },
    { id: 'b2', name: '六面',   parts: 6,  hp: 520,  glyph: '⬢', hue: 330, ai: 'spiral', note: '一条一直转的螺旋。' },
    { id: 'b3', name: '九宫',   parts: 9,  hp: 980,  glyph: '⊞', hue: 45,  ai: 'beam',   note: '站住，朝你划一条线。' },
    { id: 'b4', name: '十二面', parts: 12, hp: 1800, glyph: '◍', hue: 200, ai: 'summon', note: '一直在吐小的。' },
    { id: 'b5', name: '无面',   parts: 16, hp: 3200, glyph: '◈', hue: 280, ai: 'cross',  note: '四条正交的线一起放。' },
    { id: 'b6', name: '二十四面', parts: 24, hp: 6000, glyph: '❋', hue: 160, ai: 'sweep', note: '横着扫过整个场。' },
    { id: 'b7', name: '千面',   parts: 30, hp: 11000, glyph: '✺', hue: 20,  ai: 'ring',   note: '放得比「三环」密得多。' },
    { id: 'b8', name: '无相',   parts: 36, hp: 19000, glyph: '❂', hue: 300, ai: 'cross',  note: '破到只剩芯的时候，它才真的开始。' }
  ];

  /* 已开的波相：wave 之前开的全在。条数封顶五条。 */
  function activePhases(wave) {
    return PHASES.filter(function (p) { return wave >= p.wave; });
  }
  function nextPhase(wave) {
    return PHASES.filter(function (p) { return p.wave > wave; })[0] || null;
  }

  /* 波相的 mods 合到一张表上。
     spawnMul / hpMul / spdMul / rMul / dropMul / bossHp 是**乘**；
     waveTighten / wallHp / zoneHp / drain / bossEvery / eliteChance 是**基线**
     ——后三个是被「抬到至少这么多」的效果，写成乘会让「盛」的 0.34
     把 0.06 压成 0.02，比不开还低。引擎在 merge 里按 MUL_KEYS 乘，
     所以这几项在这里先自己算好，再作为最终值交给它。 */
  function phaseMods(wave) {
    var o = {
      spawnMul: 1, hpMul: 1, spdMul: 1, rMul: 1, dropMul: 1,
      waveTighten: 0, wallHp: 1, zoneHp: 1, slowZones: 0, drain: 0,
      bossEvery: 10, bossHp: 1, eliteChance: 0.06, mist: 0
    };
    PHASES.forEach(function (p) {
      if (wave < p.wave) return;
      var m = p.mods || {};
      for (var k in m) {
        if (o[k] == null) continue;
        var isMul = (k === 'spawnMul' || k === 'hpMul' || k === 'spdMul' || k === 'rMul' ||
                     k === 'dropMul' || k === 'waveTighten' || k === 'wallHp' ||
                     k === 'zoneHp' || k === 'drain' || k === 'bossEvery' ||
                     k === 'bossHp' || k === 'eliteChance');
        o[k] = isMul ? o[k] * m[k] : o[k] + m[k];
      }
    });
    o.bossEvery = Math.max(1, Math.round(m_bossEvery(wave)));
    o.eliteChance = Math.max(o.eliteChance, m_elite(wave));
    return o;
  }

  /* 「盛」把 Boss 间隔**压到** 5 波，不是乘上去——10 × 5 = 50 会把 Boss 推得比不开还稀。 */
  function m_bossEvery(wave) {
    var e = 10;
    PHASES.forEach(function (p) {
      if (wave < p.wave) return;
      if (p.mods && p.mods.bossEvery) e = Math.min(e, p.mods.bossEvery);
    });
    return e;
  }

  /* 「盛」只把精化率**抬到** 0.34，不是把它乘上去。 */
  function m_elite(wave) {
    var e = 0.06;
    PHASES.forEach(function (p) {
      if (wave < p.wave) return;
      if (p.mods && p.mods.eliteChance) e = Math.max(e, p.mods.eliteChance);
    });
    return e;
  }

  function bossAt(wave, R) {
    var every = (R && R.bossEvery) ? R.bossEvery : 10;
    if (wave === 0 || wave % every !== 0) return null;
    var i = Math.min(BOSSES.length - 1, Math.floor(wave / every) - 1);
    return BOSSES[Math.max(0, i)];
  }

  /* Boss 血量：二次增长，再乘纪元的律与波相的 bossHp。 */
  function bossScale(wave, law) {
    var s = 1 + wave * 0.14 + wave * wave * 0.02;
    if (law && law.bossWave) s *= law.bossWave;
    return s;
  }

  /* 一波里出什么、什么时候出。同种子同波次 = 同一张时刻表。
     挑哪一种走 pickKind 的加权——四类各有自己的权重，
     再乘这一局对这一类的偏爱，所以「这一局巨构特别多」是可能发生的。 */
  function plan(wave, seed, growth) {
    var rng = MC.seed.rngFrom(seed, 'wave' + wave);
    var count = Math.min(70, 5 + Math.floor(wave * 1.9));
    var pace = Math.max(0.42, 1 - wave * 0.013);
    var out = [];
    for (var i = 0; i < count; i++) {
      var d = MC.enemies.pickKind(wave, rng, growth);
      out.push({ kind: d.id, at: i * (rng() * 18 + 8) * pace });
    }
    return out;
  }

  /* 精化：给某一只挂徽记。徽记看得见，所以可以针对。
     概率 = 波相给的底子 + 养成室的抬升，封顶 45%。 */
  /* 精英类专用：不掷骰子，直接给一枚。它必带徽记，所以这里必须必得。 */
  function forceElite(wave, idc) {
    var rng = MC.seed.rngFrom(wave, 'elite' + idc);
    var pool = ELITES.filter(function (e) { return e.id !== 'twin' || wave >= 10; });
    return pool[Math.floor(rng() * pool.length) % pool.length];
  }

  function rollElite(wave, R, idc, bonus) {
    var p = (R && R.eliteChance) || 0.06;
    p += bonus || 0;
    if (p <= 0) return null;
    if (p > 0.45) p = 0.45;
    var rng = MC.seed.rngFrom(wave, 'elite' + idc);
    if (rng() > p) return null;
    var pool = ELITES.filter(function (e) { return e.id !== 'twin' || wave >= 10; });
    return pool[Math.floor(rng() * pool.length) % pool.length];
  }

  MC.PHASES = PHASES;
  MC.ELITES = ELITES;
  MC.BOSSES = BOSSES;
  MC.waves = {
    activePhases: activePhases, nextPhase: nextPhase, phaseMods: phaseMods,
    bossAt: bossAt, bossScale: bossScale, plan: plan, rollElite: rollElite,
    forceElite: forceElite,
    eliteById: function (id) { return ELITE_BY[id] || null; }
  };
})(window.MC);
