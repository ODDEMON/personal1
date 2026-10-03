/* world/modules.js —— 元件表
   --------------------------------------------------------------------------
   四条约定，改这张表前先读：
     1. 表里写的是「基型」（BASE）。等级由程序展开：bolt / bolt2 / bolt3 各自是独立元件。
        加一个基型 = 加一项，图鉴、装配台、培养皿、养成室自动认领。
     2. 等级缩放统一走 scaleMods：加算量直接乘，乘算量换算成「差量」再乘。
        别在逻辑里各写一套。
     3. 协同（SYNERGY）按基型匹配，与等级无关；强度按两个槽位的平均等级放大。
     4. mods 是裸值，最终一律过 MC.eff 钳制；养成室的加成在这里并入，也在 eff 里收口。
   ========================================================================== */
window.MC = window.MC || {};
(function (MC) {
  'use strict';

  /* levels = 这个基型有几级（下面按阶统一给，表里那一项只是留白用的例外）。
     min = 从第几波开始可能掉。dropW = 掉落权重，越大越常见。稀有基型给小权重。 */
  var BASES = [
    /* ---- 弹道 ---- */
    { id: 'bolt',    name: '直击',   glyph: '↑', cat: 'ballistic', tier: 1, levels: 3, min: 1,  dropW: 10, mods: { dmg: 6 },                                   note: '实。剩下的部分是速度的事。' },
    { id: 'rapid',   name: '连发',   glyph: '⋮', cat: 'ballistic', tier: 1, levels: 3, min: 1,  dropW: 10, mods: { rateMul: 0.82 },                            note: '手快。快到一定程度，量自己会变成质。' },
    { id: 'spread',  name: '散射',   glyph: '⋀', cat: 'ballistic', tier: 1, levels: 3, min: 1,  dropW: 9,  mods: { count: 2, spread: 0.30, dmg: -1 },          note: '一次撒出去一把。每一颗都轻一点。' },
    { id: 'pierce',  name: '穿透',   glyph: '↠', cat: 'ballistic', tier: 2, levels: 3, min: 3,  dropW: 7,  mods: { pierce: 1 },                                note: '一颗，过两个人。' },
    { id: 'heavy',   name: '重装',   glyph: '●', cat: 'ballistic', tier: 2, levels: 3, min: 4,  dropW: 6,  mods: { dmg: 14, rateMul: 1.25, size: 2 },          note: '慢。每一颗都算数。' },
    { id: 'swift',   name: '疾行弹', glyph: '⇉', cat: 'ballistic', tier: 2, levels: 3, min: 4,  dropW: 6,  mods: { bulletSpeed: 4 },                           note: '先到先得。' },
    { id: 'homing',  name: '追迹',   glyph: '◠', cat: 'ballistic', tier: 3, levels: 3, min: 8,  dropW: 4,  mods: { homing: 0.55 },                             note: '它自己拐弯。你只管把方向指个大概。' },
    { id: 'chain',   name: '链击',   glyph: '⤳', cat: 'ballistic', tier: 3, levels: 3, min: 9,  dropW: 4,  mods: { chain: 2, dmg: -2 },                        note: '打中一个，跳到下一个。跳的那下轻。' },
    { id: 'burst',   name: '爆裂',   glyph: '✳', cat: 'ballistic', tier: 3, levels: 3, min: 10, dropW: 4,  mods: { blast: 26, dmg: 3 },                        note: '到点开花。' },
    { id: 'split',   name: '分裂',   glyph: '⑂', cat: 'ballistic', tier: 4, levels: 2, min: 13, dropW: 2,  mods: { split: 2 },                                 note: '死了还分两颗出去。' },
    { id: 'orbit',   name: '环轨',   glyph: '◎', cat: 'ballistic', tier: 4, levels: 2, min: 14, dropW: 2,  mods: { orbit: 2, dmg: 4 },                         note: '身外多了两个转的。你走到哪儿它们跟到哪儿。' },
    { id: 'lance',   name: '长矛',   glyph: '⟶', cat: 'ballistic', tier: 4, levels: 2, min: 16, dropW: 2,  mods: { pierce: 3, bulletSpeed: 2, dmg: 4 },        note: '一条线穿到底。' },
    { id: 'volley',  name: '齐发',   glyph: '⁝', cat: 'ballistic', tier: 4, levels: 2, min: 16, dropW: 2,  mods: { count: 3, rateMul: 1.18 },                  note: '一次出去一大片。代价是慢半拍。' },
    { id: 'rail',    name: '轨炮',   glyph: '⟼', cat: 'ballistic', tier: 5, levels: 2, min: 22, dropW: 1,  mods: { dmg: 22, rateMul: 1.40, pierce: 2 },        note: '慢。它不留东西。' },
    { id: 'bloom',   name: '绽开',   glyph: '✺', cat: 'ballistic', tier: 5, levels: 2, min: 24, dropW: 1,  mods: { blast: 34, split: 1, dmg: 4 },              note: '开了还想再开一次。' },

    /* ---- 本体 ---- */
    { id: 'hull',    name: '甲壳',   glyph: '▣', cat: 'chassis', tier: 1, levels: 3, min: 1,  dropW: 10, mods: { hp: 30 },                                    note: '厚。' },
    { id: 'legs',    name: '足部',   glyph: '⋁', cat: 'chassis', tier: 1, levels: 3, min: 1,  dropW: 10, mods: { speed: 0.9 },                                note: '跑得快。走位是唯一要你亲自动手的事。' },
    { id: 'core',    name: '核芯',   glyph: '◇', cat: 'chassis', tier: 2, levels: 3, min: 3,  dropW: 7,  mods: { hp: 45, dmg: 4 },                            note: '又厚又能打。它同时是两件事。' },
    { id: 'slim',    name: '收束',   glyph: '△', cat: 'chassis', tier: 2, levels: 2, min: 5,  dropW: 6,  mods: { radiusMul: 0.82, speed: 0.5, hitMul: 0.82 },    note: '小。滑。判定点跟着一起小——命中判定按那一点点算，小就是强。' },
    { id: 'bulk',    name: '膨胀',   glyph: '▢', cat: 'chassis', tier: 2, levels: 2, min: 5,  dropW: 6,  mods: { radiusMul: 1.25, hp: 25, speed: -0.4, hitMul: 1.18 }, note: '大了，也慢了。大是为了挨，不是为了躲。' },
    { id: 'magnet',  name: '吸附',   glyph: '∪', cat: 'chassis', tier: 1, levels: 2, min: 2,  dropW: 8,  mods: { magnet: 46 },                                note: '东西自己飞过来。' },
    { id: 'plate',   name: '镀层',   glyph: '▤', cat: 'chassis', tier: 3, levels: 2, min: 11, dropW: 3,  mods: { hp: 20, shield: 18 },                        note: '外面再糊一层。护壁会自己长回来。' },
    { id: 'gyro',    name: '陀螺',   glyph: '◍', cat: 'chassis', tier: 3, levels: 2, min: 12, dropW: 3,  mods: { speed: 1.2, radiusMul: 0.88 },               note: '转起来就停不住。' },
    { id: 'anchor',  name: '锚',     glyph: '⊥', cat: 'chassis', tier: 4, levels: 2, min: 18, dropW: 2,  mods: { hp: 70, speed: -0.6, shield: 24 },           note: '钉在那儿。换来的厚，抵得过丢掉的快。' },

    /* ---- 规则 ---- */
    { id: 'crit',    name: '锐点',   glyph: '✧', cat: 'rule', tier: 2, levels: 3, min: 4,  dropW: 7,  mods: { crit: 0.18 },                                  note: '偶尔一下很疼。疼的那下是二点五倍。' },
    { id: 'regen',   name: '自愈',   glyph: '♺', cat: 'rule', tier: 2, levels: 3, min: 5,  dropW: 6,  mods: { regen: 2.4 },                                  note: '一直慢慢长回来。它不救急，它拖时间。' },
    { id: 'leech',   name: '汲取',   glyph: '⊕', cat: 'rule', tier: 3, levels: 2, min: 9,  dropW: 4,  mods: { lifesteal: 0.20 },                             note: '打人回血。打得越实，回得越多。' },
    { id: 'chill',   name: '迟滞',   glyph: '❄', cat: 'rule', tier: 3, levels: 2, min: 10, dropW: 4,  mods: { slow: 0.30 },                                  note: '打中的都会慢下来。慢是一种控制，不是一种伤害。' },
    { id: 'shield',  name: '护壁',   glyph: '⬡', cat: 'rule', tier: 3, levels: 2, min: 11, dropW: 3,  mods: { shield: 40, regen: 1.2 },                      note: '外面多一层。先扣它。' },
    { id: 'greed',   name: '贪食',   glyph: '⊗', cat: 'rule', tier: 2, levels: 2, min: 6,  dropW: 5,  mods: { dropMul: 1.6, dmg: -2 },                      note: '掉得多了，打得轻了。账是平的。' },
    { id: 'tempo',   name: '节拍',   glyph: '♫', cat: 'rule', tier: 3, levels: 2, min: 12, dropW: 3,  mods: { rateMul: 0.88, dmg: 3 },                       note: '踩着点子出去。' },
    { id: 'surge',   name: '涌流',   glyph: '≈', cat: 'rule', tier: 4, levels: 2, min: 17, dropW: 2,  mods: { dmg: 8, crit: 0.06, rateMul: 1.08 },           note: '一阵一阵地来。' },
    { id: 'thorn',   name: '倒刺',   glyph: '⟞', cat: 'rule', tier: 4, levels: 2, min: 19, dropW: 2,  mods: { thorn: 0.5, hp: 15 },                          note: '碰我的人自己疼。厚和疼一起给。' },
    { id: 'tide',    name: '涨落',   glyph: '≂', cat: 'rule', tier: 5, levels: 2, min: 25, dropW: 1,  mods: { dmgMul: 1.18, hp: -10, regen: 1.8 },           note: '起的时候挡不住。退的时候也一样。' },

    /* ---- 稀有 ---- */
    { id: 'clone',   name: '分身',   glyph: '⁘', cat: 'rare', tier: 4, levels: 2, min: 15, dropW: 1,  mods: { clone: 1, dmgMul: 0.72 },                      note: '再来一个你。两个都比原来那一个弱。' },
    { id: 'warp',    name: '折跃',   glyph: '⟡', cat: 'rare', tier: 4, levels: 2, min: 15, dropW: 1,  mods: { dash: 1, speed: 0.4 },                        note: '按空格挪一段。中间那段路不算数。' },
    { id: 'echo',    name: '回声',   glyph: '≋', cat: 'rare', tier: 5, levels: 2, min: 21, dropW: 1,  mods: { echo: 1, rateMul: 1.15 },                     note: '同一颗，再来一遍。迟九十毫秒。' },
    { id: 'swarm',   name: '群集',   glyph: '⁂', cat: 'rare', tier: 5, levels: 2, min: 23, dropW: 1,  mods: { count: 4, dmgMul: 0.6, spread: 0.55 },        note: '一次出去一大把。撒得开，也就打不实。' },
    { id: 'prism',   name: '棱镜',   glyph: '◈', cat: 'rare', tier: 5, levels: 2, min: 24, dropW: 1,  mods: { chain: 1, blast: 18, crit: 0.12 },            note: '又跳又炸又锐。三件事各给一点。' },
    { id: 'null',    name: '留白',   glyph: '○', cat: 'rare', tier: 5, levels: 1, min: 7,  dropW: 2,  mods: {},                                              note: '空位也是一位。空配空，还是空。' },
    { id: 'anomaly', name: '异常',   glyph: '⧨', cat: 'rare', tier: 6, levels: 1, min: 28, dropW: 0.4, mods: { dmg: 10, crit: 0.1, rateMul: 0.9, hp: 20 },   note: '它每一局都不太一样。长在哪一片上，开局才知道。' },
    { id: 'engine',  name: '引擎',   glyph: '⚙', cat: 'rare', tier: 6, levels: 1, min: 30, dropW: 0.4, mods: { orbit: 3, rateMul: 0.8, hp: 30 },            note: '外面那圈转得更快。' },
    { id: 'lattice', name: '晶格',   glyph: '⧉', cat: 'rare', tier: 6, levels: 1, min: 32, dropW: 0.3, mods: { shield: 60, hp: 40, regen: 2.2 },            note: '一层一层叠上去。' },
    { id: 'void',    name: '虚空',   glyph: '⊙', cat: 'rare', tier: 6, levels: 1, min: 34, dropW: 0.3, mods: { dash: 2, clone: 1, blast: 22, hp: -15 },     note: '中间是空的。边上不是。' }
  ];

  /* 乘算类的键：缩放时换算成差量，避免 0.82 越乘越小到失控。
     这几个键的 mods 写的是「相对 1 的偏移量」：
     0.82 = 小 18%，1.25 = 大 25%。所以它们在 compile 里必须**相乘**，
     绝不能相加——相加会让 0.82 + 0.82 = 1.64（变成「大了」）。 */
  var MUL_KEYS = { rateMul: 1, dmgMul: 1, radiusMul: 1, hitMul: 1 };

  /* ---- 等级上限：按阶给 ----
     旧版最高只有三级，稀有元件更是只有一两级——等级这条轴基本没长开。
     现在最低六阶起，稀有基型给满十级。表里手写的 levels 只在「留白」这一个例外上生效。 */
  var LEVELS_BY_TIER = { 1: 6, 2: 7, 3: 8, 4: 9, 5: 10, 6: 10 };
  var MAX_LV = 10;

  BASES.forEach(function (b) {
    /* 留白永远是空位：它没有等级，空配空还是空 */
    if (b.id === 'null') { b.levels = 1; return; }
    b.levels = LEVELS_BY_TIER[b.tier] || 6;
  });

  function lvScale(lv) { return 1 + 0.6 * ((lv || 1) - 1); }

  function scaleMods(mods, lv) {
    var k = lvScale(lv), out = {};
    for (var key in mods) {
      var v = mods[key];
      if (MUL_KEYS[key]) out[key] = 1 - (1 - v) * k;
      else out[key] = v * k;
    }
    return out;
  }

  /* ---- 程序化展开：基型 × 等级 = 元件 ---- */
  var ROMAN = ['', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ',
    'Ⅺ', 'Ⅻ', 'ⅩⅢ', 'ⅩⅣ', 'ⅩⅤ', 'ⅩⅥ'];
  var MODULES = [];
  BASES.forEach(function (b) {
    for (var lv = 1; lv <= (b.levels || 1); lv++) {
      MODULES.push({
        id: lv === 1 ? b.id : b.id + lv,
        base: b.id,
        lv: lv,
        name: b.levels > 1 ? (b.name + ' ' + (ROMAN[lv] || ('Lv' + lv))) : b.name,
        glyph: b.glyph,
        cat: b.cat,
        tier: b.tier + (lv - 1),          /* 高一级算高一阶 */
        levels: b.levels,
        min: b.min,
        dropW: b.dropW,
        mods: scaleMods(b.mods, lv),
        note: b.note
      });
    }
  });

  var BY_ID = {};
  MODULES.forEach(function (m) { BY_ID[m.id] = m; });

  function byId(id) { return BY_ID[id] || null; }
  function baseOf(id) { var m = byId(id); return m ? m.base : id; }
  function lvOf(id) { var m = byId(id); return m ? m.lv : 1; }
  function idOf(base, lv) { return (lv || 1) <= 1 ? base : base + lv; }
  function baseIds() { return BASES.map(function (b) { return b.id; }); }
  function ofBase(base) { return MODULES.filter(function (m) { return m.base === base; }); }

  /* ---- 协同：环形相邻槽位上的一对基型。
     强度按两个槽位的平均等级放大，所以「一级长枪」和「三级长枪」是两回事。 ---- */
  var SYNERGY = [
    { a: 'rapid',   b: 'spread',  id: 'volley',   name: '齐射',   mods: { count: 2, rateMul: 0.90 },    note: '连发配散射。一次出去一大片。' },
    { a: 'pierce',  b: 'swift',   id: 'lance',    name: '长枪',   mods: { pierce: 2, bulletSpeed: 3 },  note: '快到能穿三个人。' },
    { a: 'homing',  b: 'chain',   id: 'web',      name: '织网',   mods: { chain: 2, homing: 0.30 },     note: '跳过去还能拐弯。' },
    { a: 'heavy',   b: 'burst',   id: 'cannon',   name: '重炮',   mods: { blast: 40, dmg: 10 },         note: '一发一个坑。' },
    { a: 'bolt',    b: 'rail',    id: 'driver',   name: '钉入',   mods: { pierce: 2, dmg: 12 },         note: '实的东西配上长的东西。' },
    { a: 'lance',   b: 'volley',  id: 'comb',     name: '梳',     mods: { count: 2, pierce: 1 },        note: '一排过去。' },
    { a: 'bloom',   b: 'split',   id: 'bloom2',   name: '再绽',   mods: { split: 2, blast: 18 },        note: '开了还开。' },
    { a: 'hull',    b: 'regen',   id: 'living',   name: '活甲',   mods: { hp: 40, regen: 2.8 },         note: '会自己长好的壳。' },
    { a: 'plate',   b: 'anchor',  id: 'keep',     name: '守',     mods: { shield: 45, hp: 30 },         note: '厚上加厚。它不打算走。' },
    { a: 'slim',    b: 'legs',    id: 'ghost',    name: '游影',   mods: { speed: 1.2, radiusMul: 0.90 },note: '小、快、滑。三件事是一件事。' },
    { a: 'gyro',    b: 'legs',    id: 'spin',     name: '旋',     mods: { speed: 1.0, radiusMul: 0.84 },note: '转着走。' },
    { a: 'crit',    b: 'leech',   id: 'vampire',  name: '锐取',   mods: { crit: 0.14, lifesteal: 0.20 },note: '锐的那下回血更多。' },
    { a: 'crit',    b: 'surge',   id: 'spike',    name: '尖峰',   mods: { crit: 0.16, dmg: 6 },         note: '一阵里全是尖的。' },
    { a: 'chill',   b: 'burst',   id: 'frost',    name: '霜爆',   mods: { slow: 0.20, blast: 20 },      note: '炸开的地方都慢下来。' },
    { a: 'tempo',   b: 'rapid',   id: 'meter',    name: '拍子',   mods: { rateMul: 0.80, dmg: 4 },      note: '踩得很准。' },
    { a: 'thorn',   b: 'hull',    id: 'burr',     name: '芒',     mods: { thorn: 0.6, hp: 25 },         note: '一身都是小刺。' },
    { a: 'tide',    b: 'regen',   id: 'ebb',      name: '潮',     mods: { dmgMul: 1.12, regen: 2.0 },   note: '退了又来。来了又退。' },
    { a: 'orbit',   b: 'clone',   id: 'court',    name: '随侍',   mods: { orbit: 2, clone: 1 },         note: '分身也带转的。' },
    { a: 'orbit',   b: 'engine',  id: 'works',    name: '机括',   mods: { orbit: 2, rateMul: 0.88 },    note: '整圈都快了。' },
    { a: 'prism',   b: 'echo',    id: 'spectrum', name: '频谱',   mods: { chain: 2, blast: 22 },        note: '跳一次炸一次。' },
    { a: 'prism',   b: 'bloom',   id: 'refract',  name: '折射',   mods: { blast: 26, chain: 1 },        note: '炸开的那下又分了色。' },
    { a: 'greed',   b: 'magnet',  id: 'harvest',  name: '收割',   mods: { dropMul: 1.4, magnet: 40 },   note: '掉得多，捡得快。' },
    { a: 'split',   b: 'swarm',   id: 'seed',     name: '撒种',   mods: { split: 2, count: 2 },         note: '死了还撒一把。' },
    { a: 'shield',  b: 'core',    id: 'bastion',  name: '堡垒',   mods: { shield: 60, hp: 40 },         note: '又厚，外面还有一层。' },
    { a: 'shield',  b: 'lattice', id: 'crystal',  name: '结晶',   mods: { shield: 70, regen: 1.8 },     note: '一层一层往外结。' },
    { a: 'warp',    b: 'null',    id: 'voidstep', name: '虚步',   mods: { dash: 1, speed: 0.8 },        note: '留白不空着。它把空位借给了速度。' },
    { a: 'void',    b: 'null',    id: 'gap',      name: '缺口',   mods: { dash: 1, blast: 26 },         note: '空的那块会咬人。' },
    { a: 'anomaly', b: 'echo',    id: 'drift',    name: '漂',     mods: { rateMul: 0.86, crit: 0.10 },  note: '每次都不太一样。' },
    { a: 'void',    b: 'prism',   id: 'halo',     name: '晕',     mods: { chain: 2, blast: 20, clone: 1 }, note: '边上那圈亮起来了。' },
    { a: 'engine',  b: 'lattice', id: 'frame',    name: '骨架',   mods: { orbit: 2, hp: 50, shield: 30 },note: '撑得住一整套。' }
  ];

  var SLOT_COUNT = 6;

  /* ---- 显示顺序 ----
     三百多件元件摊在一页上，不排序等于没有。排法本身也是一张声明表：
     加一种排法 = 加一项，图鉴与装配台自动认领。
     kind 是「按种类分堆」，lv 是「按等级分堆」——两种都要能一眼看出自己是哪一堆，
     所以 UI 会给每一堆一个抬头。 */
  var SORTS = [
    { id: 'base', name: '表序', glyph: '≡', note: '元件表原本的顺序。同一个基型的等级挨在一起。' },
    { id: 'kind', name: '种类', glyph: '◈', note: '先按种类分堆：弹道 / 本体 / 规则 / 稀有。堆内等级从高到低。' },
    { id: 'lv',   name: '等级', glyph: 'Ⅹ', note: '按等级分堆，从十级往下。同一级里按种类排。' },
    { id: 'tier', name: '阶位', glyph: '▲', note: '按阶位从高到低。阶位里已经含了等级，这是「谁更强」的一种排法。' },
    { id: 'name', name: '名称', glyph: '文', note: '按名字排。找一件你已经知道名字的东西时用。' }
  ];
  var SORT_BY = {};
  SORTS.forEach(function (s) { SORT_BY[s.id] = s; });

  var CAT_ORDER = { ballistic: 0, chassis: 1, rule: 2, rare: 3 };
  var BASE_ORDER = {};
  BASES.forEach(function (b, i) { BASE_ORDER[b.id] = i; });

  /* 排序只改显示，不改任何判定——它连 MODULES 都不动，返回的是一份新数组。 */
  function sorted(list, mode) {
    var out = (list || MODULES).slice();
    switch (mode) {
      case 'kind':
        out.sort(function (a, b) {
          var c = (CAT_ORDER[a.cat] - CAT_ORDER[b.cat]);
          if (c) return c;
          var g = BASE_ORDER[a.base] - BASE_ORDER[b.base];
          if (g) return g;
          return b.lv - a.lv;
        });
        break;
      case 'lv':
        out.sort(function (a, b) {
          if (b.lv !== a.lv) return b.lv - a.lv;
          var c = (CAT_ORDER[a.cat] - CAT_ORDER[b.cat]);
          if (c) return c;
          return BASE_ORDER[a.base] - BASE_ORDER[b.base];
        });
        break;
      case 'tier':
        out.sort(function (a, b) {
          if (b.tier !== a.tier) return b.tier - a.tier;
          var c = (CAT_ORDER[a.cat] - CAT_ORDER[b.cat]);
          if (c) return c;
          return BASE_ORDER[a.base] - BASE_ORDER[b.base];
        });
        break;
      case 'name':
        out.sort(function (a, b) { return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); });
        break;
      default:
        /* 表序：MODULES 本来就是这个顺序，别再动它 */
        break;
    }
    return out;
  }

  /* 每一种排法要不要分堆、堆的抬头是什么。
     返回 null = 不分堆，整页一个 grid。 */
  function groupOf(m, mode) {
    if (mode === 'kind') return m.cat;
    if (mode === 'lv') return m.lv;
    return null;
  }

  function sortMode() {
    var p = (MC.bus && MC.bus.state && MC.bus.state.prefs) || null;
    var id = p && p.sort;
    return SORT_BY[id] ? id : 'base';
  }

  function setSortMode(id) {
    if (!SORT_BY[id]) return false;
    var s = MC.bus && MC.bus.state;
    if (!s) return false;
    if (!s.prefs) s.prefs = MC.cosmetics ? MC.cosmetics.blankPrefs() : {};
    s.prefs.sort = id;
    MC.bus.save();
    MC.bus.emit('state', s);
    return true;
  }

  function synergyBetween(a, b) {
    var x = baseOf(a), y = baseOf(b);
    return SYNERGY.filter(function (t) {
      return (t.a === x && t.b === y) || (t.a === y && t.b === x);
    })[0] || null;
  }

  function neighbours(i, n) {
    n = n || SLOT_COUNT;
    return [i, (i + 1) % n];
  }

  /* 协同强度：两个槽位平均等级越高，协同越狠 */
  function synScale(a, b) { return 1 + 0.45 * (((lvOf(a) + lvOf(b)) / 2) - 1); }

  /* ---- 编译：基础 mods + 协同 mods + 养成室加成，全部走 eff ---- */
  function compile(rig) {
    var nu = (MC.nursery && MC.nursery.effects) ? MC.nursery.effects() : null;
    var slots = (nu && nu.slots) ? nu.slots : SLOT_COUNT;
    var synMul = (nu && nu.synMul) ? nu.synMul : 1;

    var out = {
      dmg: 8, rate: 380, speed: 3.4, hp: 100, pierce: 0, count: 1, spread: 0,
      bulletSpeed: 7, radiusMul: 1, homing: 0, chain: 0, blast: 0, crit: 0,
      lifesteal: 0, slow: 0, regen: 0, shield: 0, split: 0, orbit: 0, clone: 0,
      dash: 0, echo: 0, magnet: 24, dropMul: 1, dmgMul: 1, rateMul: 1,
      thorn: 0, size: 0,
      /* 派生量：hitMul 由 radiusMul 与闪避合成，由引擎的 applyRig 收口。
         sizeMul 供风格「厚」放弹径，hitR 供判定点。 */
      hitMul: 1, sizeMul: 1, hitR: 4.5
    };

    var syn = [];
    var rigArr = rig || [];
    /* 异常元件每一局重掷一次：它叫异常，就该每一局都不太一样 */
    var ano = (MC.anomaly && MC.anomaly.anomalyMods) ? MC.anomaly.anomalyMods() : null;

    rigArr.forEach(function (id) {
      var m = byId(id);
      if (!m) return;
      for (var k in m.mods) {
        /* MUL_KEYS 里的键写的是「相对 1 的偏移」，所以只能相乘。
           相加会让两个「收束」变成 0.82 + 0.82 = 1.64——从「更小」翻成「更大」，
           那是这一层最容易被写错、也最不容易被发现的一处。 */
        if (MUL_KEYS[k] && typeof out[k] === 'number') out[k] *= m.mods[k];
        else if (typeof out[k] === 'number') out[k] += m.mods[k];
        else out[k] = m.mods[k];
      }
      if (m.base === 'anomaly' && ano) {
        for (var ak in ano) {
          if (typeof out[ak] === 'number' && MUL_KEYS[ak]) out[ak] *= ano[ak];
          else if (typeof out[ak] === 'number') out[ak] += ano[ak];
        }
      }
    });

    /* 协同：相邻两格。养成室可以解锁「隔一个空位也算相邻」 */
    var span = (nu && nu.synSkip) ? 2 : 1;
    for (var i = 0; i < slots; i++) {
      for (var off = 1; off <= span; off++) {
        var x = rigArr[i], y = rigArr[(i + off) % slots];
        if (!x || !y) continue;
        var s = synergyBetween(x, y);
        if (!s) continue;
        syn.push({ def: s, at: i, k: synScale(x, y) * synMul });
        for (var k2 in s.mods) {
          if (typeof out[k2] === 'number') {
            var v = s.mods[k2];
            if (MUL_KEYS[k2]) out[k2] *= (1 - (1 - v) * synScale(x, y) * synMul);
            else out[k2] += v * synScale(x, y) * synMul;
          }
        }
      }
    }

    /* 养成室的局外加成在这里并入，之后统一钳制 */
    if (nu) {
      out.hp += nu.hpAdd || 0;
      out.dmg += nu.dmgAdd || 0;
      out.speed += nu.speedAdd || 0;
      out.magnet += nu.magnetAdd || 0;
      out.crit += nu.critAdd || 0;
      out.shield += nu.shield || 0;
      out.regen += nu.regenAdd || 0;
      out.rateMul *= nu.rateMul || 1;
      out.dropMul *= nu.dropMul || 1;
      out.radiusMul *= nu.radiusMul || 1;
      out.hitMul *= nu.hitMul || 1;
    }

    out.dmg = Math.max(1, out.dmg * out.dmgMul);
    out.rate = MC.eff.effInv('fireRate', Math.round(out.rate * out.rateMul));
    out.dmg = MC.eff.eff('damage', out.dmg);
    out.speed = MC.eff.eff('speed', out.speed);
    out.hp = MC.eff.eff('hpMax', out.hp);
    out.pierce = MC.eff.eff('pierce', out.pierce);
    out.count = MC.eff.eff('projectile', Math.round(out.count));
    out.bulletSpeed = MC.eff.eff('bulletSpeed', out.bulletSpeed);
    out.dropMul = Math.max(0.2, out.dropMul);
    out.magnet = Math.max(8, out.magnet);
    out.crit = Math.max(0, Math.min(0.85, out.crit));
    out.lifesteal = Math.max(0, Math.min(0.5, out.lifesteal));
    out.thorn = Math.max(0, out.thorn);
    out.slots = slots;
    /* 判定点：与可见体积同向，但**独立**。
       可见体积是 radiusMul，判定点是 hitMul——两者都从 1 出发，
       所以「收束」（radiusMul 0.82）两个一起变小。
       注意：hitMul 不能写成 radiusMul 的函数——「膨胀」把 radiusMul 抬到 1.25
       时，判定点也该跟着变大一点（更好被击中），但不该被等级缩放翻转成 2.64。 */
    out.hitMul = Math.max(0.35, Math.min(1.6, out.hitMul));
    out.hitR = 4.5 * out.hitMul;

    return { mods: out, synergy: syn, slots: slots };
  }

  /* ---- 掉落 ----
     元件不该随手就来：先降总掉率，再按波次与养成室解锁等级上限，最后按权重挑。 */
  /* 第 n 级从第几波起开始出现。养成室与当波事件的 outLv 会提前解锁。 */
  var LVL_UNLOCK = [0, 1, 4, 8, 13, 19, 26, 34, 43, 53, 64];

  function dropPool(wave, bonusLv) {
    var cap = 1;
    for (var lv = 1; lv < LVL_UNLOCK.length; lv++) {
      if (wave >= LVL_UNLOCK[lv] - (bonusLv || 0) * 4) cap = lv;
    }
    if (cap > MAX_LV) cap = MAX_LV;
    var out = [];
    MODULES.forEach(function (m) {
      if (m.lv > cap) return;
      if (wave < m.min) return;
      out.push(m);
    });
    return out;
  }

  function rollDrop(wave, rng, bonusLv) {
    var pool = dropPool(wave, bonusLv);
    if (!pool.length) return null;
    var total = 0, i;
    for (i = 0; i < pool.length; i++) {
      /* 等级越高权重越低；基型权重再乘上去。
         衰减基数从 2.6 放缓到 1.55：十级制下 2.6^9 是五千分之一，
         高等级等于掉不出来，那条轴就白给了。 */
      var w = pool[i].dropW / Math.pow(1.55, pool[i].lv - 1);
      pool[i]._w = w; total += w;
    }
    var r = rng() * total;
    for (i = 0; i < pool.length; i++) {
      r -= pool[i]._w;
      if (r <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  MC.BASES = BASES;
  MC.MODULES = MODULES;
  MC.SYNERGY = SYNERGY;
  MC.SLOT_COUNT = SLOT_COUNT;
  MC.SORTS = SORTS;
  MC.modules = {
    byId: byId, baseOf: baseOf, lvOf: lvOf, idOf: idOf, baseIds: baseIds, ofBase: ofBase,
    compile: compile, synergyBetween: synergyBetween, neighbours: neighbours,
    scaleMods: scaleMods, lvScale: lvScale, dropPool: dropPool, rollDrop: rollDrop,
    sorted: sorted, groupOf: groupOf, sortMode: sortMode, setSortMode: setSortMode
  };
})(window.MC);
