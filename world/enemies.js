/* world/enemies.js —— 敌人表与 AI
   --------------------------------------------------------------------------
   四条约定：
     1. 名字一律用晦僻字，注释里不写它干什么。它是什么，由你自己撞出来。
     2. 血量随波次增长走 scaleOf（二次 + 三次项），再乘这一局摇出来的陡度。
        线性会让构筑失去意义；确定会让「这一局」失去意义。
     3. AI 只调 ctx 上的回调，不直接碰引擎内部。引擎提供：
          shoot / blast / zone / minion / nearest / warp / beam
        加一种敌人 = 加一项 + 一个 case。
     4. cls 是它「是哪一类」：常 / 精英 / 巨构 / 华丽。
        四类在出场权重、掉落与图鉴分组上都分开算，所以它不是装饰。
   ========================================================================== */
window.MC = window.MC || {};
(function (MC) {
  'use strict';

  /* 四类。看得见是哪一类，才知道该不该为它改构筑。 */
  var CLASSES = [
    { id: 'foe',   name: '常',   note: '在场上的大多数。一只一只看都不难，它们靠数量。' },
    { id: 'elite', name: '精英', note: '比同波的东西厚一截，掉得也多。它值得你为它单独转身。' },
    { id: 'mega',  name: '巨构', note: '几何体。大、慢、极厚。它不是敌人，它是一块会还手的地形。' },
    { id: 'gaudy', name: '华丽', note: '走得花，弹也花。它的威胁是密度，不是厚度。' }
  ];
  /* 出场权重。巨构与精英给小权重：它们一多，场就读不完了。 */
  var W_BY_CLASS = { foe: 10, gaudy: 3.4, elite: 1.5, mega: 0.8 };

  /* min = 从第几波开始出现。hp / spd / r / dmg 是第 1 波的裸值。
     cls 不写就是「常」；w 不写就按它那一类的默认权重。 */
  var ENEMIES = [
    { id: 'ash',    name: '灰针', glyph: '▲', hue: 8,   hp: 12,  spd: 1.55, r: 9,  dmg: 8,  ai: 'chase',  min: 1 },
    { id: '卯',     name: '卯',   glyph: '◈', hue: 330, hp: 16,  spd: 1.35, r: 10, dmg: 9,  ai: 'weave',  min: 1 },
    { id: 'dust',   name: '尘',   glyph: '◦', hue: 60,  hp: 6,   spd: 2.10, r: 6,  dmg: 5,  ai: 'chase',  min: 3 },
    { id: 'sleep',  name: '眠',   glyph: '◇', hue: 280, hp: 22,  spd: 2.30, r: 10, dmg: 14, ai: 'lurk',   min: 5 },
    { id: '孖',     name: '孖',   glyph: '⁂', hue: 145, hp: 26,  spd: 1.20, r: 12, dmg: 10, ai: 'chase',  min: 6, split: 2 },
    { id: 'boil',   name: '沸',   glyph: '✳', hue: 22,  hp: 30,  spd: 1.70, r: 11, dmg: 22, ai: 'bomb',   min: 8 },
    { id: 'eave',   name: '檐',   glyph: '◉', hue: 200, hp: 40,  spd: 0.95, r: 13, dmg: 10, ai: 'emit',   min: 10 },
    { id: 'thresh', name: '阈',   glyph: '▣', hue: 45,  hp: 90,  spd: 0.85, r: 15, dmg: 16, ai: 'chase',  min: 12, front: 0.25 },
    { id: '餮',     name: '餮',   glyph: '⊗', hue: 300, hp: 70,  spd: 1.10, r: 14, dmg: 18, ai: 'devour', min: 16 },
    { id: 'graupel',name: '霰',   glyph: '◬', hue: 190, hp: 34,  spd: 1.45, r: 11, dmg: 12, ai: 'scatter',min: 13 },
    { id: '仄',     name: '仄',   glyph: '⟢', hue: 100, hp: 28,  spd: 1.80, r: 10, dmg: 11, ai: 'kink',   min: 14 },
    { id: '鉴',     name: '鉴',   glyph: '⧗', hue: 260, hp: 38,  spd: 1.60, r: 11, dmg: 13, ai: 'mirror', min: 17 },
    { id: '引',     name: '引',   glyph: '⊛', hue: 12,  hp: 55,  spd: 0.80, r: 15, dmg: 10, ai: 'draw',   min: 18, pull: 0.30 },
    { id: '罅',     name: '罅',   glyph: '⌇', hue: 320, hp: 30,  spd: 1.90, r: 10, dmg: 15, ai: 'slip',   min: 19 },
    { id: '蕈',     name: '蕈',   glyph: '⁕', hue: 130, hp: 60,  spd: 0.75, r: 14, dmg: 9,  ai: 'spore',  min: 20 },
    { id: '杼',     name: '杼',   glyph: '⟿', hue: 40,  hp: 48,  spd: 1.05, r: 12, dmg: 20, ai: 'sweep',  min: 22 },
    { id: '穹',     name: '穹',   glyph: '⬡', hue: 210, hp: 75,  spd: 0.70, r: 15, dmg: 8,  ai: 'dome',   min: 24, aura: 96 },
    { id: '蠹',     name: '蠹',   glyph: '⊘', hue: 90,  hp: 52,  spd: 1.25, r: 12, dmg: 12, ai: 'rot',    min: 26 },
    { id: '躔',     name: '躔',   glyph: '⩚', hue: 350, hp: 44,  spd: 2.20, r: 11, dmg: 16, ai: 'coast',  min: 28 },
    { id: '罟',     name: '罟',   glyph: '⌗', hue: 170, hp: 58,  spd: 0.90, r: 13, dmg: 9,  ai: 'weft',   min: 30, web: 1 },
    { id: '傀',     name: '傀',   glyph: '≟', hue: 300, hp: 46,  spd: 1.65, r: 11, dmg: 14, ai: 'ape',    min: 32 },
    { id: '霣',     name: '霣',   glyph: '☄', hue: 25,  hp: 66,  spd: 0.60, r: 16, dmg: 26, ai: 'fall',   min: 34 },
    { id: '徽',     name: '徽',   glyph: '∿', hue: 230, hp: 62,  spd: 1.00, r: 13, dmg: 11, ai: 'chord',  min: 36 },
    { id: '窦',     name: '窦',   glyph: '⌾', hue: 285, hp: 88,  spd: 0.55, r: 16, dmg: 10, ai: 'gate',   min: 38 },
    { id: '湮',     name: '湮',   glyph: '⬢', hue: 55,  hp: 80,  spd: 1.15, r: 14, dmg: 18, ai: 'sink',   min: 40 },
    { id: '玺',     name: '玺',   glyph: '☰', hue: 0,   hp: 150, spd: 0.90, r: 20, dmg: 22, ai: 'crown',  min: 44 },

    /* ---- 巨构几何体：大、慢、极厚。它是一块会还手的地形 ---- */
    { id: '城', name: '城', glyph: '▤', hue: 200, hp: 240,  spd: 0.44, r: 30, dmg: 18, ai: 'bulwark', min: 9,  cls: 'mega' },
    { id: '阙', name: '阙', glyph: '⌸', hue: 172, hp: 420,  spd: 0.30, r: 33, dmg: 22, ai: 'spire',   min: 15, cls: 'mega' },
    { id: '础', name: '础', glyph: '▩', hue: 30,  hp: 700,  spd: 0.24, r: 36, dmg: 20, ai: 'plinth',  min: 21, cls: 'mega' },
    { id: '枢', name: '枢', glyph: '◍', hue: 280, hp: 1050, spd: 0.52, r: 32, dmg: 26, ai: 'axis',    min: 28, cls: 'mega' },
    { id: '垠', name: '垠', glyph: '▬', hue: 340, hp: 1500, spd: 0.58, r: 38, dmg: 30, ai: 'horizon', min: 35, cls: 'mega' },

    /* ---- 华丽生物：走得花，弹也花。威胁是密度不是厚度 ---- */
    { id: '翎', name: '翎', glyph: '❦', hue: 320, hp: 68,  spd: 1.95, r: 13, dmg: 14, ai: 'plume',  min: 11, cls: 'gaudy' },
    { id: '屏', name: '屏', glyph: '❖', hue: 300, hp: 110, spd: 1.50, r: 15, dmg: 16, ai: 'fan',    min: 17, cls: 'gaudy' },
    { id: '绶', name: '绶', glyph: '⋘', hue: 260, hp: 150, spd: 2.10, r: 14, dmg: 18, ai: 'ribbon', min: 23, cls: 'gaudy' },
    { id: '珞', name: '珞', glyph: '⁘', hue: 48,  hp: 200, spd: 1.70, r: 16, dmg: 20, ai: 'bead',   min: 29, cls: 'gaudy' },
    { id: '翚', name: '翚', glyph: '✺', hue: 12,  hp: 280, spd: 1.30, r: 17, dmg: 22, ai: 'iris',   min: 37, cls: 'gaudy' },

    /* ---- 精英：厚一截，掉得也多 ---- */
    { id: '骁', name: '骁', glyph: '➤', hue: 8,   hp: 130, spd: 1.80, r: 15, dmg: 20, ai: 'vanguard', min: 8,  cls: 'elite' },
    { id: '魁', name: '魁', glyph: '⬣', hue: 96,  hp: 280, spd: 1.30, r: 18, dmg: 26, ai: 'champion', min: 16, cls: 'elite' },
    { id: '侯', name: '侯', glyph: '⯃', hue: 210, hp: 440, spd: 1.10, r: 19, dmg: 24, ai: 'warden',   min: 24, cls: 'elite' },
    { id: '胄', name: '胄', glyph: '✥', hue: 25,  hp: 640, spd: 1.40, r: 20, dmg: 30, ai: 'herald',   min: 32, cls: 'elite', burn: 1 },
    { id: '尊', name: '尊', glyph: '❂', hue: 290, hp: 920, spd: 1.20, r: 22, dmg: 34, ai: 'overlord', min: 42, cls: 'elite' }
  ];

  /* cls 与 w 的兜底：表上手写的那一项优先，没写就按类给。
     这样加一种巨构不用记得写权重，也不会因为漏写而变成满场都是。 */
  ENEMIES.forEach(function (d) {
    if (!d.cls) d.cls = 'foe';
    if (!d.w) d.w = W_BY_CLASS[d.cls] || 10;
    if (d.burn) d.burn = 1;
  });

  var W = 1120, H = 620;
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function pool(wave) {
    return ENEMIES.filter(function (e) { return wave >= e.min; });
  }

  /* ---- 曲线：二次 + 三次项 ----
     纯二次在三十波以后还是太「平」——构筑一旦成型，后四十波是同一场戏重播。
     加一个小的三次项，让后段真的开始追人。对照（陡度取中性）：
                 旧（纯二次）  现在
        第 10 波    3.3        3.7　+13%
        第 20 波    7.0        8.8　+26%
        第 30 波   12.3       17.1　+39%
        第 40 波   19.0       28.8　+52%
        第 50 波   26.9       44.8　+67%
     三次项只在后段发力：前十几波几乎不受影响，所以新手局的手感不变，
     而「更陡」兑现成的是后段真的追得上构筑，不是前十波一起变厚。 */
  var CURVE = { a: 0.16, b: 0.0098, c: 0.00009 };

  function scaleOf(wave, growth) {
    var s = 1 + wave * CURVE.a + wave * wave * CURVE.b + wave * wave * wave * CURVE.c;
    if (growth) s = 1 + (s - 1) * growth.steep;
    return s;
  }

  /* ---- 局内成长随机化 ----
     旧版只有一条确定的曲线：同一个编号的每一局，第 20 波一定长成同一个样子。
     于是「这一局」这个概念在数值上是不存在的——你打的是一张表，不是一局。
     现在开局先摇一份「脾气」，再给每一波摇一次抖动：
       steep   整条曲线的陡度（0.82 ~ 1.28）
       jitter  每一波上下抖多少（0.10 ~ 0.30）
       hpBias / spdBias / dmgBias  这一局整体偏厚、偏快还是偏疼
     三样都摊在明面上（主舞台 HUD 会写出来），所以「这一局更陡」是你能读出来的
     一条信息，不是背后悄悄改的数字。 */
  function runGrowth(seed, token) {
    var rng = MC.seed.rngFrom(seed, 'growth' + token);
    return {
      seed: seed, token: token,
      steep: 0.82 + rng() * 0.46,
      jitter: 0.10 + rng() * 0.20,
      hpBias: 0.88 + rng() * 0.26,
      spdBias: 0.92 + rng() * 0.18,
      dmgBias: 0.86 + rng() * 0.30,
      /* 这一局偏爱哪一类：四类各给一个偏置，所以「这一局巨构多」是可能的 */
      classBias: { foe: 1, gaudy: 0.7 + rng() * 0.9, elite: 0.6 + rng() * 1.0, mega: 0.5 + rng() * 1.1 }
    };
  }

  /* 每一波的抖动。同一个 (种子, 局数, 波次) 永远得到同一个数，
     所以「重开同一编号」仍然是可复现的。 */
  function waveJitter(growth, wave) {
    if (!growth || !growth.jitter) return 1;
    var rng = MC.seed.rngFrom(growth.seed, 'wf' + growth.token + '_' + wave);
    return Math.max(0.6, 1 + (rng() * 2 - 1) * growth.jitter);
  }

  /* 按权重挑一种。四类各有自己的权重，再乘这一局对这一类的偏爱。 */
  function pickKind(wave, rng, growth) {
    var pool2 = pool(wave);
    var total = 0, i;
    for (i = 0; i < pool2.length; i++) {
      var w = pool2[i].w * (growth ? (growth.classBias[pool2[i].cls] || 1) : 1);
      total += w;
    }
    var r = rng() * total;
    for (i = 0; i < pool2.length; i++) {
      r -= pool2[i].w * (growth ? (growth.classBias[pool2[i].cls] || 1) : 1);
      if (r <= 0) return pool2[i];
    }
    return pool2[pool2.length - 1];
  }

  function make(kindId, wave, x, y, rng, scale, growth) {
    var d = null;
    for (var i = 0; i < ENEMIES.length; i++) if (ENEMIES[i].id === kindId) { d = ENEMIES[i]; break; }
    if (!d) d = ENEMIES[0];
    var s = scale || 1;
    var S = scaleOf(wave, growth);
    var jit = waveJitter(growth, wave);
    var hpB = growth ? growth.hpBias : 1;
    var spB = growth ? growth.spdBias : 1;
    var dmB = growth ? growth.dmgBias : 1;
    var hp0 = d.hp * S * s * hpB * jit;
    var r0 = rng ? Math.floor(rng() * 2147483647) : Math.floor(Math.random() * 2147483647);
    return {
      kind: d.id, name: d.name, glyph: d.glyph, hue: d.hue, ai: d.ai, cls: d.cls,
      x: x, y: y, vx: 0, vy: 0,
      hp: hp0, maxHp: hp0,
      /* 巨构与精英的体积按类给一份额外的：它们「大」是看得见的，不是血条上的。 */
      r: d.r * (d.cls === 'mega' ? 1 + Math.min(0.5, wave * 0.006) : 1),
      spd: d.spd * (1 + Math.min(0.55, wave * 0.014)) * spB,
      dmg: d.dmg * (1 + wave * 0.10) * dmB,
      front: d.front || 0, split: d.split || 0,
      pull: d.pull || 0, aura: d.aura || 0, web: d.web || 0,
      burn: d.burn || 0,
      slow: 0, flash: 0, phase: (rng ? rng() : Math.random()) * Math.PI * 2,
      armed: false, spent: false, cool: 0, dead: false, sunk: 0, age: 0,
      rng: MC.seed.rngFrom(r0, 'ai' + d.id),
      spin: 0, arc: (rng ? rng() : Math.random()) * Math.PI * 2
    };
  }

  /* ---- AI ---- */
  function step(e, ctx, dt) {
    var p = ctx.player;
    var dx = p.x - e.x, dy = p.y - e.y;
    var d = Math.hypot(dx, dy) || 1;
    var ux = dx / d, uy = dy / d;
    var sp = e.spd * (e.slow > 0 ? 0.45 : 1) * dt;
    var R = e.rng;
    if (e.slow > 0) e.slow -= dt;
    if (e.flash > 0) e.flash -= dt;
    if (e.cool > 0) e.cool -= dt;
    e.age += dt;
    e.spin += 0.02 * dt;

    switch (e.ai) {
      case 'chase':
        e.vx = ux * sp; e.vy = uy * sp;
        break;

      case 'weave': {
        var tx = -uy, ty = ux;
        e.phase += 0.03 * dt;
        var radial = d > 160 ? 0.75 : -0.25;
        e.vx = (tx * Math.cos(e.phase) + ux * radial) * sp * 1.15;
        e.vy = (ty * Math.cos(e.phase) + uy * radial) * sp * 1.15;
        break;
      }

      /* 眠：远远盯着，冲一次，然后就没劲了。
         旧版每 80 帧重新蓄一次力、冲速还叠 1.9 倍——那不是敌人，那是节拍器。
         现在：蓄力 46 帧（看得见的外环），冲一次，spent 之后慢到原来的 0.35。
         一只一辈子只冲一次，所以它可以被绕开、被引开、被当一次性资源用掉。 */
      case 'lurk':
        if (!e.armed && !e.spent && d < 210) { e.armed = true; e.cool = 46; }
        if (e.armed) {
          if (e.cool > 0) { e.vx = 0; e.vy = 0; }              /* 蓄力：站住不动，外环在收 */
          else {
            e.vx = ux * sp * 2.6; e.vy = uy * sp * 2.6;       /* 冲这一次 */
            e.spent = 1; e.armed = false;
          }
        } else if (e.spent) {
          e.vx = ux * sp * 0.35; e.vy = uy * sp * 0.35;       /* 没劲了 */
        } else { e.vx = 0; e.vy = 0; }                          /* 还没醒：在远处等着 */
        break;

      case 'bomb':
        e.vx = ux * sp; e.vy = uy * sp;
        if (d < e.r + p.r + 16) { ctx.blast(e, 74, e.dmg); e.dead = true; }
        break;

      case 'emit': {
        var want = 250;
        e.vx = ux * sp * (d > want ? 1 : -0.7);
        e.vy = uy * sp * (d > want ? 1 : -0.7);
        if (e.cool <= 0) { e.cool = 74; ctx.shoot(e, ux, uy, 3.4, e.dmg * 0.6); }
        break;
      }

      case 'devour': {
        var prey = ctx.nearest(e, 240, true);
        if (prey) {
          var px = prey.x - e.x, py = prey.y - e.y;
          var pd = Math.hypot(px, py) || 1;
          e.vx = px / pd * sp; e.vy = py / pd * sp;
          if (pd < e.r + prey.r) {
            e.hp += prey.maxHp * 0.5; e.maxHp += prey.maxHp * 0.5;
            e.r = Math.min(30, e.r + 0.8);
            prey.dead = true; prey.eaten = true;
          }
        } else { e.vx = ux * sp; e.vy = uy * sp; }
        break;
      }

      /* 霰：到点撒一把扇形弹 */
      case 'scatter': {
        e.vx = ux * sp * (d > 200 ? 1 : 0.2);
        e.vy = uy * sp * (d > 200 ? 1 : 0.2);
        if (e.cool <= 0 && d < 420) {
          e.cool = 96;
          var base = Math.atan2(uy, ux);
          for (var k = -2; k <= 2; k++) {
            var a = base + k * 0.19;
            ctx.shoot(e, Math.cos(a), Math.sin(a), 3.0, e.dmg * 0.38);
          }
        }
        break;
      }

      /* 仄：折着过来 */
      case 'kink':
        e.phase += 0.085 * dt;
        e.vx = (ux + -uy * Math.sin(e.phase) * 1.5) * sp;
        e.vy = (uy + ux * Math.sin(e.phase) * 1.5) * sp;
        break;

      /* 鉴：走你在场上的对称位置 */
      case 'mirror': {
        var mx = W - p.x, my = H - p.y;
        var mdx = mx - e.x, mdy = my - e.y, md = Math.hypot(mdx, mdy) || 1;
        e.vx = mdx / md * sp * 1.15; e.vy = mdy / md * sp * 1.15;
        break;
      }

      /* 引：站远，把你往它那边拽（拉扯由引擎读 e.pull 实现） */
      case 'draw':
        e.vx = ux * sp * (d > 300 ? 1 : -0.5);
        e.vy = uy * sp * (d > 300 ? 1 : -0.5);
        break;

      /* 罅：隔一阵挪一次位置 */
      case 'slip':
        e.vx = ux * sp * 0.6; e.vy = uy * sp * 0.6;
        if (e.cool <= 0) {
          e.cool = 60 + Math.floor(R() * 40);
          ctx.warp(e, 200);
        }
        break;

      /* 蕈：边走边掉小的 */
      case 'spore':
        e.vx = ux * sp * 0.5; e.vy = uy * sp * 0.5;
        if (e.cool <= 0) { e.cool = 150; ctx.minion(e, 'dust', 2); }
        break;

      /* 杼：蓄一下，然后划一条线 */
      case 'sweep':
        if (!e.armed && d < 300) { e.armed = true; e.cool = 70; }
        if (e.armed) {
          if (e.cool > 30) { e.vx = 0; e.vy = 0; }
          else if (e.cool > 0) { e.vx = ux * sp * 0.3; e.vy = uy * sp * 0.3; }
          else { ctx.beam(e, ux, uy, 520, e.dmg * 0.8); e.armed = false; e.cool = 190; }
        } else { e.vx = ux * sp * 0.7; e.vy = uy * sp * 0.7; }
        break;

      /* 穹：给身边的一圈撑盾 */
      case 'dome':
        e.vx = ux * sp * 0.35; e.vy = uy * sp * 0.35;
        break;

      /* 蠹：走过的路留下会烂的斑 */
      case 'rot':
        e.vx = ux * sp; e.vy = uy * sp;
        if (e.cool <= 0) { e.cool = 52; ctx.zone(e.x, e.y, 34, 300, e.dmg * 0.10, 0); }
        break;

      /* 躔：贴着边绕，绕够了冲一次 */
      case 'coast': {
        if (!e.armed) {
          var cx = W / 2 - e.x, cy = H / 2 - e.y, cd = Math.hypot(cx, cy) || 1;
          e.vx = (-cy / cd + cx / cd * 0.22) * sp * 1.1;
          e.vy = (cx / cd + cy / cd * 0.22) * sp * 1.1;
          e.phase += dt;
          if (e.phase > 150) { e.armed = true; e.cool = 52; }
        } else if (e.cool > 20) { e.vx = 0; e.vy = 0; }
        else { e.vx = ux * sp * 2.4; e.vy = uy * sp * 2.4; if (e.cool <= 0) { e.armed = false; e.phase = 0; e.cool = 0; } }
        break;
      }

      /* 罟：铺一片把你拖慢的网 */
      case 'weft':
        e.vx = ux * sp * 0.6; e.vy = uy * sp * 0.6;
        if (e.cool <= 0) { e.cool = 120; ctx.zone(e.x, e.y, 62, 420, e.dmg * 0.05, 0.35); }
        break;

      /* 傀：跟着你，保持一个歪着的偏移 */
      case 'ape': {
        var off = e.arc + Math.sin(e.age / 70) * 1.4;
        var ax = p.x + Math.cos(off) * 150, ay = p.y + Math.sin(off) * 150;
        var adx = ax - e.x, ady = ay - e.y, ad = Math.hypot(adx, ady) || 1;
        e.vx = adx / ad * sp * 1.2; e.vy = ady / ad * sp * 1.2;
        if (e.cool <= 0 && d < 210) { e.cool = 110; ctx.shoot(e, ux, uy, 4.2, e.dmg * 0.5); }
        break;
      }

      /* 霣：从天上砸下来，砸出一个坑 */
      case 'fall':
        if (e.sunk > 0) {
          e.sunk -= dt; e.vx = 0; e.vy = 0;
          if (e.sunk <= 0) { ctx.blast(e, 96, e.dmg * 0.7); ctx.zone(e.x, e.y, 46, 240, e.dmg * 0.08, 0); }
        } else {
          e.vx = ux * sp * 0.5; e.vy = uy * sp * 0.5;
          if (e.cool <= 0) {
            e.cool = 210; e.sunk = 42;
            e.x = clamp(p.x + (R() - 0.5) * 150, 40, W - 40);
            e.y = clamp(p.y + (R() - 0.5) * 150, 40, H - 40);
          }
        }
        break;

      /* 徽：一圈一圈旋出去的弹 */
      case 'chord':
        e.vx = ux * sp * (d > 260 ? 1 : -0.4);
        e.vy = uy * sp * (d > 260 ? 1 : -0.4);
        e.arc += 0.14 * dt;
        if (e.cool <= 0) {
          e.cool = 16;
          ctx.shoot(e, Math.cos(e.arc), Math.sin(e.arc), 2.8, e.dmg * 0.30);
          ctx.shoot(e, Math.cos(e.arc + Math.PI), Math.sin(e.arc + Math.PI), 2.8, e.dmg * 0.30);
        }
        break;

      /* 窦：站住不动，往外吐一串 */
      case 'gate':
        e.vx = 0; e.vy = 0;
        if (e.cool <= 0) {
          e.cool = 130;
          for (var g = 0; g < 3; g++) ctx.minion(e, 'dust', 1);
        }
        break;

      /* 湮：周期性沉下去，沉的时候打不动 */
      case 'sink':
        if (e.sunk > 0) {
          e.sunk -= dt; e.vx = ux * sp * 1.7; e.vy = uy * sp * 1.7;
        } else {
          e.vx = ux * sp * 0.9; e.vy = uy * sp * 0.9;
          if (e.cool <= 0) { e.cool = 150; e.sunk = 46; }
        }
        break;

      /* 玺：转着圈的盾弧，隔一阵放一圈弹 */
      case 'crown':
        e.arc += 0.03 * dt;
        e.vx = ux * sp * 0.55; e.vy = uy * sp * 0.55;
        if (e.cool <= 0) {
          e.cool = 120;
          for (var c = 0; c < 10; c++) {
            var ca = e.arc + c * (Math.PI * 2 / 10);
            ctx.shoot(e, Math.cos(ca), Math.sin(ca), 2.6, e.dmg * 0.34);
          }
        }
        break;

      /* ================= 巨构几何体 =================
         这一类共有的形状：慢、大、厚。它们几乎不追人，它们的威胁是
         「占着一块地方，并且一直在那儿放东西」。 */

      /* 城：慢慢挪，隔一阵放一圈 */
      case 'bulwark':
        e.vx = ux * sp * 0.55; e.vy = uy * sp * 0.55;
        e.arc += 0.012 * dt;
        if (e.cool <= 0) {
          e.cool = 150;
          for (var bw = 0; bw < 8; bw++) {
            var ba = e.arc + bw * (Math.PI * 2 / 8);
            ctx.shoot(e, Math.cos(ba), Math.sin(ba), 2.4, e.dmg * 0.30);
          }
        }
        break;

      /* 阙：立着不动，往外画一条一直转的螺旋 */
      case 'spire':
        e.vx = ux * sp * 0.18; e.vy = uy * sp * 0.18;
        e.arc += 0.09 * dt;
        if (e.cool <= 0) {
          e.cool = 11;
          ctx.shoot(e, Math.cos(e.arc), Math.sin(e.arc), 2.2, e.dmg * 0.20);
          ctx.shoot(e, Math.cos(e.arc + Math.PI), Math.sin(e.arc + Math.PI), 2.2, e.dmg * 0.20);
        }
        break;

      /* 础：几乎不动，脚下一直留一片会烂的斑 */
      case 'plinth':
        e.vx = ux * sp * 0.22; e.vy = uy * sp * 0.22;
        if (e.cool <= 0) {
          e.cool = 120;
          ctx.zone(e.x, e.y, 74, 320, e.dmg * 0.16, 0.28);
        }
        break;

      /* 枢：绕着场心转，转过的路上留痕 */
      case 'axis': {
        var acx = W / 2 - e.x, acy = H / 2 - e.y;
        var rad2 = Math.hypot(acx, acy) || 1;
        e.vx = (-acy / rad2 + acx / rad2 * 0.20) * sp * 1.5;
        e.vy = (acx / rad2 + acy / rad2 * 0.20) * sp * 1.5;
        if (e.cool <= 0) { e.cool = 46; ctx.zone(e.x, e.y, 40, 190, e.dmg * 0.10, 0.18); }
        break;
      }

      /* 垠：横着扫过整个场，扫到边上再扫回来，隔一阵划一条线 */
      case 'horizon':
        e.vx = sp * 1.4 * (e.dir || 1); e.vy = uy * sp * 0.25;
        if (e.x > W - 60) e.dir = -1;
        else if (e.x < 60) e.dir = 1;
        if (e.cool <= 0) {
          e.cool = 170;
          ctx.beam(e, e.dir || 1, 0, 620, e.dmg * 0.55);
        }
        break;

      /* ================= 华丽生物 =================
         这一类共有的形状：走得花，弹也花。它们的血不厚，
         威胁来自密度——你躲的是一片形状，不是一只东西。 */

      /* 翎：转着螺旋靠过来，一路撒花瓣 */
      case 'plume':
        e.phase += 0.05 * dt;
        e.vx = (ux + -uy * Math.sin(e.phase) * 1.1) * sp;
        e.vy = (uy + ux * Math.sin(e.phase) * 1.1) * sp;
        if (e.cool <= 0 && d < 460) {
          e.cool = 40;
          var pa = Math.atan2(uy, ux);
          for (var pk = -1; pk <= 1; pk++) {
            var paa = pa + pk * 0.34 + Math.sin(e.phase) * 0.2;
            ctx.shoot(e, Math.cos(paa), Math.sin(paa), 2.9, e.dmg * 0.26);
          }
        }
        break;

      /* 屏：靠近了就开一次屏——一大片扇形 */
      case 'fan':
        e.vx = ux * sp * (d > 240 ? 1 : 0.25); e.vy = uy * sp * (d > 240 ? 1 : 0.25);
        if (e.cool <= 0 && d < 380) {
          e.cool = 120;
          var fa = Math.atan2(uy, ux);
          for (var fk = -4; fk <= 4; fk++) {
            var faa = fa + fk * 0.17;
            ctx.shoot(e, Math.cos(faa), Math.sin(faa), 2.7, e.dmg * 0.24);
          }
        }
        break;

      /* 绶：走正弦，后面拖一串 */
      case 'ribbon':
        e.phase += 0.07 * dt;
        e.vx = (ux + -uy * Math.sin(e.phase) * 1.7) * sp * 1.15;
        e.vy = (uy + ux * Math.sin(e.phase) * 1.7) * sp * 1.15;
        if (e.cool <= 0) {
          e.cool = 13;
          var ra = e.phase * 2;
          ctx.shoot(e, Math.cos(ra), Math.sin(ra), 2.4, e.dmg * 0.16);
        }
        break;

      /* 珞：一圈珠子绕着它转，珠子会射 */
      case 'bead':
        e.vx = ux * sp * 0.7; e.vy = uy * sp * 0.7;
        e.arc += 0.10 * dt;
        if (e.cool <= 0) {
          e.cool = 20;
          for (var bk = 0; bk < 3; bk++) {
            var baa = e.arc + bk * (Math.PI * 2 / 3);
            ctx.shoot(e, Math.cos(baa), Math.sin(baa), 3.0, e.dmg * 0.20);
          }
        }
        break;

      /* 翚：张一圈眼，交替吐 */
      case 'iris':
        e.vx = ux * sp * (d > 260 ? 1 : -0.3); e.vy = uy * sp * (d > 260 ? 1 : -0.3);
        e.arc += 0.05 * dt;
        if (e.cool <= 0) {
          e.cool = 74;
          var eyes = 7;
          for (var ek = 0; ek < eyes; ek++) {
            var eaa = e.arc + ek * (Math.PI * 2 / eyes);
            ctx.shoot(e, Math.cos(eaa), Math.sin(eaa), 2.5, e.dmg * 0.22);
          }
        }
        break;

      /* ================= 精英 =================
         这一类共有的形状：厚一截、掉得也多。它们用的是「常」那批的走法，
         只是每一只都比同波的东西硬，且死的时候给得起东西。 */

      /* 骁：冲在前面。隔一阵加速一次 */
      case 'vanguard':
        if (e.cool <= 0) { e.cool = 90; e.armed = true; }
        if (e.armed && e.cool > 50) { e.vx = ux * sp * 2.5; e.vy = uy * sp * 2.5; e.armed = false; }
        else { e.vx = ux * sp * 1.2; e.vy = uy * sp * 1.2; }
        break;

      /* 魁：厚，外面糊一层，边走边点射 */
      case 'champion':
        e.vx = ux * sp; e.vy = uy * sp;
        if (e.cool <= 0 && d < 400) {
          e.cool = 66;
          var ha = Math.atan2(uy, ux);
          for (var hk = -1; hk <= 1; hk++) ctx.shoot(e, Math.cos(ha + hk * 0.22), Math.sin(ha + hk * 0.22), 3.6, e.dmg * 0.34);
        }
        break;

      /* 侯：站中距，撒一片把你拖慢的场，同时三向点射 */
      case 'warden':
        e.vx = ux * sp * (d > 250 ? 1 : -0.4); e.vy = uy * sp * (d > 250 ? 1 : -0.4);
        if (e.cool <= 0) {
          e.cool = 110;
          ctx.zone(e.x, e.y, 58, 300, e.dmg * 0.09, 0.34);
          var wa = Math.atan2(uy, ux);
          for (var wk = -1; wk <= 1; wk++) ctx.shoot(e, Math.cos(wa + wk * 0.3), Math.sin(wa + wk * 0.3), 3.2, e.dmg * 0.30);
        }
        break;

      /* 胄：直冲。死的时候炸一大圈（burn 在引擎的 onEnemyDead 里兑现） */
      case 'herald':
        e.vx = ux * sp * 1.15; e.vy = uy * sp * 1.15;
        e.arc += 0.04 * dt;
        if (e.cool <= 0 && d < 320) {
          e.cool = 140;
          for (var hc = 0; hc < 6; hc++) {
            var hca = e.arc + hc * (Math.PI * 2 / 6);
            ctx.shoot(e, Math.cos(hca), Math.sin(hca), 2.8, e.dmg * 0.26);
          }
        }
        break;

      /* 尊：慢慢压过来，一路放小的 */
      case 'overlord':
        e.vx = ux * sp * 0.8; e.vy = uy * sp * 0.8;
        if (e.cool <= 0) {
          e.cool = 190;
          ctx.minion(e, 'dust', 2);
          ctx.zone(e.x, e.y, 46, 240, e.dmg * 0.10, 0.2);
        }
        break;

      default:
        e.vx = ux * sp; e.vy = uy * sp;
    }

    e.x = clamp(e.x + e.vx, 8, W - 8);
    e.y = clamp(e.y + e.vy, 8, H - 8);
  }

  /* 沉下去的时候打不动它 */
  function invulnerable(e) { return e.ai === 'sink' && e.sunk > 0; }

  MC.ENEMIES = ENEMIES;
  MC.CLASSES = CLASSES;
  MC.enemies = {
    pool: pool, make: make, step: step, scaleOf: scaleOf, invulnerable: invulnerable,
    runGrowth: runGrowth, waveJitter: waveJitter, pickKind: pickKind,
    classById: function (id) {
      return CLASSES.filter(function (c) { return c.id === id; })[0] || CLASSES[0];
    },
    ofClass: function (cls) {
      return ENEMIES.filter(function (e) { return e.cls === cls; });
    }
  };
})(window.MC);
