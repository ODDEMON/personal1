/* world/reactions.js —— 培养皿反应
   --------------------------------------------------------------------------
   任意两个元件投进去都有反应。N 个基型就有 N(N+1)/2 种组合，手写不完，
   所以这里只手写「有名堂」的那些，其余全部由种子确定性推导——
   同一对元件在同一存档里永远得到同一个结果，可结果是什么，得跑了才知道。

   **合成不再需要时间。** 旧版每一条都带一个 12–240 秒的 sec，
   代价是「等待」而不是「元件」，于是玩家可以无限白嫖——
   投两个、等着、收一个，库存从来不减，那一炉就永远开着。
   现在：sec 一律为 0，代价是**两个元件本身**。合成在 rooms/culture.html
   里扣掉 S.inventory，落进产物。元件是这一局捡的，这一局就要用掉。

   混沌：养成室的「杂」会把分支往更怪的方向推（双产出 / 残渣 / 空 / 留白变多）。
   ========================================================================== */
window.MC = window.MC || {};
(function (MC) {
  'use strict';

  /* ---- 手写部分：这些组合有名堂 ----
     sec 全部写 0：合成瞬时。留 sec 字段是为了以后能加「需要孵」的那一类，
     但现在没有一类需要。 */
  var NAMED = [
    { a: 'bolt',   b: 'bolt',   out: ['heavy'],        sec: 0,  note: '两个直击挤在一起，变沉了。' },
    { a: 'rapid',  b: 'rapid',  out: ['swift'],        sec: 0,  note: '快到一定程度就变成速度。' },
    { a: 'bolt',   b: 'rapid',  out: ['pierce'],       sec: 0,  note: '又快又实，就穿过去了。' },
    { a: 'spread', b: 'heavy',  out: ['burst'],        sec: 0,  note: '撒得多的东西，最后会炸。' },
    { a: 'pierce', b: 'swift',  out: ['chain'],        sec: 0,  note: '穿过去以后，还想再穿一个。' },
    { a: 'rapid',  b: 'homing', out: ['chain'],        sec: 0,  note: '追着追着就连上了。' },
    { a: 'hull',   b: 'hull',   out: ['regen'],        sec: 0,  note: '两层壳之间长出了东西。' },
    { a: 'hull',   b: 'regen',  out: ['shield'],       sec: 0,  note: '会长的壳往外顶出一层。' },
    { a: 'hull',   b: 'legs',   out: ['slim'],         sec: 0,  note: '又要厚又要快，只能变小。' },
    { a: 'slim',   b: 'legs',   out: ['clone'],        sec: 0,  note: '小到一定程度，就分成两个。' },
    { a: 'legs',   b: 'swift',  out: ['warp'],         sec: 0,  note: '快到不需要走完那段路。' },
    { a: 'split',  b: 'homing', out: ['orbit'],        sec: 0,  note: '分开的那些不肯走了，留下来转。' },
    { a: 'magnet', b: 'bolt',   out: ['greed'],        sec: 0,  note: '吸得多了就变成贪。' },
    { a: 'crit',   b: 'hull',   out: ['leech'],        sec: 0,  note: '锐的地方破了，自己会吸。' },
    { a: 'swift',  b: 'hull',   out: ['chill'],        sec: 0,  note: '撞上厚的东西，速度就留在那儿了。' },
    { a: 'crit',   b: 'homing', out: ['echo'],         sec: 0,  note: '同一颗子弹来了两遍。' },
    { a: 'chain',  b: 'burst',  out: ['prism'],        sec: 0,  note: '跳一次，炸一次，散成一片。' },
    { a: 'magnet', b: 'greed',  out: ['swarm'],        sec: 0,  note: '吸来的东西多到成群。' },
    { a: 'orbit',  b: 'engine', out: ['engine'],       sec: 0,  note: '两个转的叠成了一个更快的。' },
    { a: 'prism',  b: 'void',   out: ['halo2'],        sec: 0,  note: '边上那圈亮得看不清中间。' },
    { a: 'lattice',b: 'core',   out: ['lattice'],      sec: 0,  note: '一层一层往里结。' },
    { a: 'anomaly',b: 'null',   out: ['anomaly'],      sec: 0,  note: '空位把它自己也吸进去了。' },
    { a: 'null',   b: 'null',   out: ['null'],         sec: 0,  note: '空配空，还是空。' },
    { a: 'tide',   b: 'regen',  out: ['ebb2'],         sec: 0,  note: '退了又来，来了又退。' },
    { a: 'rail',   b: 'lance',  out: ['rail'],         sec: 0,  note: '长的一条变得更长了。' }
  ];

  /* 推导结果的注脚池。晦一点，不解释机制。
     炉子里发生了什么，留给注脚说；产物是什么，留给产物自己说。 */
  var NOTES = [
    '炉子里响了一下。',
    '两边都不肯先动，最后是中间先动的。',
    '沉下去又浮上来。',
    '出来的东西比进去的两个都安静。',
    '壁上结了一层霜。',
    '有那么一瞬间，炉子是空的。',
    '它自己挑了一边。',
    '两样东西互相绕了很久。',
    '先出来的那个回头看了一眼。',
    '这次比上次快。',
    '渣子沉在底下，上面的清了。',
    '炉盖被顶开过一次。',
    '闻着像烧过的糖。',
    '它长成了第三个样子。',
    '两个都还在，只是换了位置。',
    '边上多出来一小块。',
    '出来的这个不认识进去的那两个。',
    '响动是从底下传上来的。',
    '开炉的时候，里面已经有一个了。',
    '这次的数和上次是同一个。',
    '它先看了一眼左边。',
    '两样东西合起来，比原来小。',
    '炉子比上一次热。',
    '渣子比东西多。',
    '记下来了。'
  ];

  var FAIL_NOTES = [
    '炉子是热的。里面是空的。',
    '两样东西各自待着，谁也没理谁。',
    '开炉。里面是灰。'
  ];

  function fnv(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function ukey(a, b) {
    var x = MC.modules.baseOf(a), y = MC.modules.baseOf(b);
    return [x, y].sort().join('+');
  }

  function chaos() {
    var nu = (MC.nursery && MC.nursery.effects) ? MC.nursery.effects() : null;
    return (nu && nu.rxChaos) ? 1 : 0;
  }
  function outLvBonus() {
    var nu = (MC.nursery && MC.nursery.effects) ? MC.nursery.effects() : null;
    return (nu && nu.outLvBonus) ? nu.outLvBonus : 0;
  }

  /* 候选产物：等级受养成室「上位 / 厚养」影响 */
  function candidates(tier) {
    var capLv = 1 + outLvBonus();
    return MC.MODULES.filter(function (m) {
      return m.lv <= capLv && m.tier >= tier - 1 && m.tier <= tier + 2;
    });
  }

  /* 同名基型 -> 升一阶。这是高阶元件的主要来路。 */
  function upgradeOf(id) {
    var m = MC.modules.byId(id);
    if (!m) return null;
    var family = MC.modules.ofBase(m.base);
    if (family.length <= 1) return null;
    var next = MC.modules.idOf(m.base, m.lv + 1);
    return MC.modules.byId(next) ? [next] : null;
  }

  /* ---- 推导：任意一对 ---- */
  function derive(a, b) {
    var A = MC.modules.byId(a), B = MC.modules.byId(b);
    if (!A || !B) return null;

    /* 1) 手写表优先（按基型匹配） */
    var k = ukey(a, b);
    var named = NAMED.filter(function (r) { return ukey(r.a, r.b) === k; })[0];

    /* 2) 同名：升阶。这是高阶元件的主要来路。
          sec 一律 0——合成瞬时，代价是那两个元件本身。 */
    if (A.base === B.base) {
      var up = upgradeOf(A.lv >= B.lv ? a : b);
      if (up) {
        return { a: a, b: b, out: up, sec: 0, kind: 'upgrade',
                 note: '同一个东西，往上长了一级。', named: false };
      }
      if (named) return decorate(named, a, b);
      return { a: a, b: b, out: [], sec: 0, kind: 'fail',
               note: FAIL_NOTES[fnv(k) % FAIL_NOTES.length], named: false };
    }

    if (named) return decorate(named, a, b);

    /* 留白跟谁都反应，出来的还是留白——它是清空位，也是保底位 */
    if (A.base === 'null' || B.base === 'null') {
      return { a: a, b: b, out: ['null'], sec: 0, kind: 'null',
               note: '留白把什么都吃了。', named: false };
    }

    /* 3) 推导。sec 恒为 0。 */
    var h = fnv(k + '|rx');
    var r1 = h & 255, r2 = (h >>> 8) & 255, r3 = (h >>> 16) & 255, r4 = (h >>> 24) & 255;
    var tier = Math.round((A.tier + B.tier) / 2);
    var pool = candidates(tier);
    if (!pool.length) pool = MC.MODULES.slice(0, 12);

    var ch = chaos();
    var roll = r2 % 100;
    var thTwin = 10 + ch * 14;
    var thRes = thTwin + 11 + ch * 9;
    var thFail = thRes + 7 + ch * 8;
    var thNull = thFail + 6 + ch * 6;

    var note = NOTES[r3 % NOTES.length];

    if (roll < thTwin) {
      var o1 = pool[(r3 + r4) % pool.length];
      var o2 = pool[(r3 * 3 + r4 * 7 + 1) % pool.length];
      return { a: a, b: b, out: [o1.id, o2.id], sec: 0, kind: 'twin', note: note, named: false };
    }
    if (roll < thRes) {
      return { a: a, b: b, out: [], sec: 0, kind: 'residue',
               residue: 2 + (r3 % 5), note: NOTES[(r3 + 5) % NOTES.length], named: false };
    }
    if (roll < thFail) {
      return { a: a, b: b, out: [], sec: 0, kind: 'fail',
               note: FAIL_NOTES[r3 % FAIL_NOTES.length], named: false };
    }
    if (roll < thNull) {
      return { a: a, b: b, out: ['null'], sec: 0, kind: 'null',
               note: '出来的是个空位。', named: false };
    }
    var o = pool[r3 % pool.length];
    return { a: a, b: b, out: [o.id], sec: 0, kind: 'normal', note: note, named: false };
  }

  function decorate(n, a, b) {
    var out = (n.out || []).filter(function (id) { return !!MC.modules.byId(id); });
    return {
      a: a, b: b, out: out, sec: n.sec, kind: n.kind || (out.length > 1 ? 'twin' : 'normal'),
      note: n.note, named: true, residue: n.residue || 0
    };
  }

  /* 对外：找一对的反应。同一次调用、同一存档，结果恒定。 */
  function find(a, b) {
    if (!a || !b) return null;
    return derive(a, b);
  }

  /* 一个元件能参与多少种组合——图鉴用来显示「还差多少」 */
  function degree(id) {
    var n = 0;
    var bases = MC.modules.baseIds();
    for (var i = 0; i < bases.length; i++) {
      if (find(id, bases[i])) n++;
    }
    return n;
  }

  function all() { return NAMED.slice(); }
  function total() {
    var n = MC.modules.baseIds().length;
    return n * (n + 1) / 2;
  }

  MC.REACTIONS = NAMED;
  MC.reactions = { find: find, degree: degree, all: all, total: total, derive: derive };
})(window.MC);
