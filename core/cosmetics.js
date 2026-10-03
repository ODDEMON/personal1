/* ==========================================================================
   core/cosmetics.js —— 皮肤与游戏风格
   --------------------------------------------------------------------------
   两张表，两种东西，别混：

     SKINS  皮肤。只改颜色。判定逐字相同——换皮不影响任何一条规则。
     STYLES 风格。改规则。每一项都是一组乘算，写在 styleMods 里，
            由引擎在 recalcRule() 与 applyRig() 两处收口。

   皮肤 = 一套调色板（CSS 变量 + 舞台专用色）。风格 = 一组乘算。
   两者正交：任何皮肤都能配任何风格。

   改这张表前先读：
     1. 皮肤不许出现任何参与判定的字段。写了就是 bug。
     2. 风格的键只能在 STYLE_KEYS 里。引擎只读这张表，不认 id。
     3. 风格改的是「这一局的形状」，不是「这一局的难度上限」。
        难度上限归 MC.eff，风格只乘在上面。
   ========================================================================== */
window.MC = window.MC || {};
(function (MC) {
  'use strict';

  /* ---- 舞台专用色：不参与 CSS，只给 canvas ---- */
  function stage(bg, grid, glow, core, coreLine, dust, ember) {
    return { bg: bg, grid: grid, glow: glow, core: core, coreLine: coreLine, dust: dust, ember: ember };
  }

  var SKINS = [
    {
      id: 'ink', name: '墨', glyph: '◐', note: '底色近黑，字是亮的。默认这一套。',
      ui: {
        bg: '#07070a', panel: '#0f0f16', panel2: '#16161f', hi: '#f2f2f8', fg: '#e0e0ea',
        dim: '#a8a8b8', dim2: '#c8c8d6', line: '#24242f', line2: '#33333f', btn: '#17171f',
        hiBg: '#1c1c26', acc: '#6fe3c8', acc2: '#b9a6ff', accLine: '#2c5f57',
        warn: '#e0ab6e', bad: '#ff7a6a',
        ballistic: '#6fc8f0', chassis: '#e0b467', rule: '#6fe0a8', rare: '#c79bff'
      },
      stage: stage('#07070a', 'rgba(255,255,255,0.032)', 'rgba(40,52,74,0.30)',
        '#eef0f8', 'rgba(190,240,255,0.9)', 'rgba(200,215,245,', 'rgba(255,190,120,')
    },
    {
      id: 'paper', name: '纸', glyph: '◑', note: '翻成浅底。暗处改成描边，亮处改成实心。',
      ui: {
        bg: '#f4f4ef', panel: '#ffffff', panel2: '#ebebe4', hi: '#14141a', fg: '#24242c',
        dim: '#5c5c68', dim2: '#767684', line: '#dcdcd2', line2: '#c4c4b8', btn: '#f0f0ea',
        hiBg: '#e8f2ee', acc: '#1c6b58', acc2: '#7d3a6a', accLine: '#a8ccc2',
        warn: '#7d5c14', bad: '#a83a2c',
        ballistic: '#1c6b90', chassis: '#8a5c14', rule: '#1c6b58', rare: '#6b3a90'
      },
      stage: stage('#f4f4ef', 'rgba(20,20,26,0.055)', 'rgba(120,140,170,0.16)',
        '#14141a', 'rgba(20,20,26,0.85)', 'rgba(60,70,90,', 'rgba(200,120,40,')
    },
    {
      id: 'deep', name: '深', glyph: '◉', note: '压到深蓝。适合暗房，长时间看。',
      ui: {
        bg: '#050a14', panel: '#0b1220', panel2: '#111b2e', hi: '#e8f0ff', fg: '#d2ddf0',
        dim: '#93a4c0', dim2: '#b4c4dc', line: '#1b2740', line2: '#26344f', btn: '#101a2c',
        hiBg: '#16233a', acc: '#5ec8ff', acc2: '#9d8cff', accLine: '#1e4a6e',
        warn: '#e0b46e', bad: '#ff7a6a',
        ballistic: '#5ec8ff', chassis: '#e0b467', rule: '#5ee8c0', rare: '#b08cff'
      },
      stage: stage('#050a14', 'rgba(140,180,255,0.045)', 'rgba(30,60,110,0.30)',
        '#e8f0ff', 'rgba(120,200,255,0.9)', 'rgba(150,190,240,', 'rgba(255,170,90,')
    },
    {
      id: 'moss', name: '苔', glyph: '◔', note: '整屏偏绿。血量的颜色也跟着换。',
      ui: {
        bg: '#060a07', panel: '#0d1410', panel2: '#141d17', hi: '#eef6ee', fg: '#dce8dc',
        dim: '#9fb09f', dim2: '#bccbba', line: '#1e2a20', line2: '#2b3a2d', btn: '#111a14',
        hiBg: '#16221a', acc: '#8fe07a', acc2: '#c8b06a', accLine: '#2f5230',
        warn: '#d8c06a', bad: '#e0705a',
        ballistic: '#7ad0e0', chassis: '#d0b060', rule: '#8fe07a', rare: '#b090e0'
      },
      stage: stage('#060a07', 'rgba(160,220,160,0.035)', 'rgba(30,60,40,0.30)',
        '#eef6ee', 'rgba(150,230,140,0.9)', 'rgba(190,220,180,', 'rgba(200,230,110,')
    },
    {
      id: 'ember', name: '烬', glyph: '◑', note: '偏暖。血是红的，护壁是金的。',
      ui: {
        bg: '#0a0705', panel: '#140e0a', panel2: '#1d1510', hi: '#f8f0e8', fg: '#ece0d4',
        dim: '#b8a898', dim2: '#d0c0b0', line: '#2a1e16', line2: '#3b2b20', btn: '#1a120c',
        hiBg: '#241811', acc: '#ffa860', acc2: '#ff8a7a', accLine: '#6e4426',
        warn: '#e8c46a', bad: '#ff6a52',
        ballistic: '#ffb870', chassis: '#e0c060', rule: '#ff9060', rare: '#e080c0'
      },
      stage: stage('#0a0705', 'rgba(255,200,150,0.035)', 'rgba(80,40,20,0.30)',
        '#f8f0e8', 'rgba(255,180,120,0.9)', 'rgba(230,200,170,', 'rgba(255,150,80,')
    },
    {
      id: 'bone', name: '白', glyph: '○', note: '近乎无彩。所有东西都靠形状区分，不靠颜色。',
      ui: {
        bg: '#0c0c0c', panel: '#161616', panel2: '#1e1e1e', hi: '#fafafa', fg: '#e8e8e8',
        dim: '#a8a8a8', dim2: '#c8c8c8', line: '#2a2a2a', line2: '#3a3a3a', btn: '#1a1a1a',
        hiBg: '#242424', acc: '#e8e8e8', acc2: '#b0b0b0', accLine: '#4a4a4a',
        warn: '#c8c8c8', bad: '#ffffff',
        ballistic: '#e0e0e0', chassis: '#c0c0c0', rule: '#f0f0f0', rare: '#a0a0a0'
      },
      stage: stage('#0c0c0c', 'rgba(255,255,255,0.05)', 'rgba(70,70,70,0.28)',
        '#fafafa', 'rgba(255,255,255,0.9)', 'rgba(220,220,220,', 'rgba(240,240,240,')
    }
  ];

  /* 风格改的键。引擎只认这张表。 */
  var STYLE_KEYS = ['hpMul', 'spdMul', 'spawnMul', 'dropMul', 'rateMul', 'residueMul', 'sizeMul'];

  var STYLES = [
    {
      id: 'plain', name: '素', glyph: '○', note: '不加也不减。默认这一套，规则一条不改。',
      mods: {}
    },
    {
      id: 'swift', name: '疾', glyph: '⇶', note: '一切都快一档：跑得快、打得勤，命薄。掉得少。',
      mods: { speedMul: 1.18, rateMul: 0.86, hpMul: 0.82, dropMul: 0.85, residueMul: 0.9 }
    },
    {
      id: 'bulwark', name: '厚', glyph: '▣', note: '壳很厚、打得很慢。走得慢，换来活得久。',
      mods: { speedMul: 0.84, rateMul: 1.22, hpMul: 1.45, sizeMul: 1.15, dropMul: 0.95 }
    },
    {
      id: 'sparse', name: '稀', glyph: '⋯', note: '场上永远很空。东西少，可掉下来的更值钱。',
      mods: { spawnMul: 0.62, dropMul: 1.85, hpMul: 1.2, residueMul: 1.3 }
    },
    {
      id: 'dense', name: '密', glyph: '⁘', note: '挤。出场数量上浮，掉落略降。',
      mods: { spawnMul: 1.55, dropMul: 0.82, hpMul: 0.95, residueMul: 0.85 }
    },
    {
      id: 'quiet', name: '静', glyph: '⊘', note: '这一局不抽当波事件。规则少一条，残渣多两成。',
      mods: { quiet: 1, residueMul: 1.25, dropMul: 1.1 }
    },
    {
      id: 'long', name: '远', glyph: '↝', note: '血量长得慢一点。给你更多时间把系统改对。',
      mods: { hpWave: 0.72, dropMul: 1.2, residueMul: 1.15 }
    }
  ];

  var SKIN_BY = {}, STYLE_BY = {};
  SKINS.forEach(function (s) { SKIN_BY[s.id] = s; });
  STYLES.forEach(function (s) { STYLE_BY[s.id] = s; });

  /* sort = 图鉴与装配台的显示顺序。它是纯显示，不进判定，所以默认值给「表序」。 */
  function blankPrefs() { return { skin: 'ink', style: 'plain', aim: 'manual', fx: 1, showFoeHp: 1, sort: 'base' }; }

  function skin() {
    var id = (MC.bus && MC.bus.state && MC.bus.state.prefs && MC.bus.state.prefs.skin) || 'ink';
    return SKIN_BY[id] || SKINS[0];
  }
  function style() {
    var id = (MC.bus && MC.bus.state && MC.bus.state.prefs && MC.bus.state.prefs.style) || 'plain';
    return STYLE_BY[id] || STYLES[0];
  }
  /* 风格的全部乘算。mul 类的键没写就是 1，flag 类的键没写就是 0。 */
  function styleMods() {
    var s = style(), o = {};
    o.speedMul = 1; o.rateMul = 1; o.hpMul = 1; o.spawnMul = 1;
    o.dropMul = 1; o.residueMul = 1; o.sizeMul = 1; o.hpWave = 1; o.quiet = 0;
    var m = s.mods || {};
    for (var k in m) if (o[k] != null) o[k] = m[k];
    return o;
  }

  /* 皮肤落到 CSS 变量上。换皮只跑这一处。 */
  function applySkin() {
    var sk = skin();
    var root = document.documentElement;
    var map = {
      '--bg': 'bg', '--panel': 'panel', '--panel2': 'panel2', '--hi': 'hi', '--fg': 'fg',
      '--dim': 'dim', '--dim2': 'dim2', '--line': 'line', '--line2': 'line2', '--btn': 'btn',
      '--hi-bg': 'hiBg', '--acc': 'acc', '--acc2': 'acc2', '--acc-line': 'accLine',
      '--warn': 'warn', '--bad': 'bad',
      '--ballistic': 'ballistic', '--chassis': 'chassis', '--rule': 'rule', '--rare': 'rare'
    };
    for (var css in map) root.style.setProperty(css, sk.ui[map[css]]);
    MC.bus.emit('skin', sk.id);
    return sk;
  }

  MC.SKINS = SKINS;
  MC.STYLES = STYLES;
  MC.cosmetics = {
    skin: skin, style: style, styleMods: styleMods, applySkin: applySkin,
    skinById: function (id) { return SKIN_BY[id] || null; },
    styleById: function (id) { return STYLE_BY[id] || null; },
    blankPrefs: blankPrefs,
    /* 舞台取色：引擎每一帧都调一次，所以给个直接引用 */
    stage: function () { return skin().stage; },
    STYLE_KEYS: STYLE_KEYS
  };
})(window.MC);
