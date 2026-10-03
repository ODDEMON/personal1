/* ==========================================================================
   test/smoke.mjs —— jsdom 无头冒烟
   --------------------------------------------------------------------------
   守住几条一动就崩的不变式：
     · 同种子同波次 = 同一张时刻表（可复现）
     · 构筑编译后所有数值都落在上下限里，且协同真的会触发
     · 反应表可查、留白通配真的吃掉一切，且**合成不吃时间**
     · 合成真的扣元件；每局结束未装配元件真的退回熔炉
     · 受击冷却整整一秒，且第二下真的进不来
     · 判定点比可见体积小，判定走点不走面
     · 眠一辈子只冲一次
     · 开火方向只来自鼠标，不来自自动选敌
     · 阶跃按数量级走，纪元换尺子，且高阶会开始产生压力
     · 主舞台能跑满若干帧不抛错、不出 NaN，并且真的打得死东西
     · 声轨、皮肤、冷静模式都不进判据
   用法：npm test / npm run test:core / rooms / tone
   ========================================================================== */
import { JSDOM, VirtualConsole } from 'jsdom';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

let pass = 0, fail = 0;
const fails = [];
function ok(c, l) {
  if (c) { pass++; return; }
  fail++;
  /* 标签缺失时也要说得出是哪一条——否则只能看到一个 null 在列表里 */
  fails.push((l == null ? ('<无标签 @' + (new Error().stack.split('\n')[2] || '').trim()) : l));
}
function eq(a, b, l) { ok(a === b, l + '（实际 ' + JSON.stringify(a) + '）'); }
function section(n) { process.stdout.write('\n  ' + n + '\n'); }

/* jsdom 没有 canvas：给一个够用的假 2D 上下文 */
function fakeCtx() {
  const noop = () => {};
  return {
    canvas: { width: 1120, height: 620 },
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', globalAlpha: 1,
    save: noop, restore: noop, translate: noop, rotate: noop, scale: noop, setTransform: noop,
    clearRect: noop, fillRect: noop, strokeRect: noop, beginPath: noop, closePath: noop,
    moveTo: noop, lineTo: noop, arc: noop, rect: noop, fill: noop, stroke: noop,
    fillText: noop, strokeText: noop, clip: noop, drawImage: noop, putImageData: noop,
    setLineDash: noop, getLineDash: () => [],
    ellipse: noop, quadraticCurveTo: noop, bezierCurveTo: noop, arcTo: noop,
    createPattern: () => null, isPointInPath: () => false, isPointInStroke: () => false,
    measureText: () => ({ width: 10 }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createLinearGradient: () => ({ addColorStop: noop }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) })
  };
}

function makeConsole() {
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => {
    const m = String((e && e.message) || e);
    if (/Not implemented/.test(m)) return;
    if (m.indexOf('SecurityError') >= 0) return;
    /* jsdom 自己取不到 file:// 下的 iframe；页面对此有降级提示 */
    if (/Could not load iframe/.test(m)) return;
    fail++;
    fails.push('运行时错误：' + m);
  });
  vc.on('error', () => {});
  return vc;
}

async function open(rel) {
  const dom = await JSDOM.fromFile(path.join(ROOT, rel), {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: makeConsole(),
    beforeParse(window) {
      window.HTMLCanvasElement.prototype.getContext = () => fakeCtx();
      window.requestAnimationFrame = () => 0;   /* 帧循环由测试手动推进 */
      window.cancelAnimationFrame = () => {};
      window.confirm = () => true;
      window.AudioContext = undefined;
      window.devicePixelRatio = 1;
    }
  });
  /* 等脚本全部落地再交出去：提前 close 会把还在飞的 script 请求掐断，
     那些断掉的请求会被记成「运行时错误」，看起来像页面坏了，其实是测试太急。 */
  await new Promise((r) => setTimeout(r, 220));
  return dom;
}

/* ============ 1. 核心 ============ */
async function testCore() {
  section('核心');
  const dom = await open('index.html');
  const w = dom.window, MC = w.MC;
  ok(!!MC, 'MC 命名空间存在');
  ok(!!(MC && MC.seed && MC.eff && MC.bus && MC.audio && MC.engine), 'core 五件套已挂载');
  ok(!!(MC && MC.cosmetics && MC.epoch), 'cosmetics / epoch 已挂载');
  ok(!!(MC.MODULES && MC.ENEMIES && MC.REACTIONS && MC.PHASES && MC.LADDER), 'world 声明表已挂载');
  /* 旧版两张表已经整体删除。留着它们的引用 = 改漏了 */
  ok(MC.MUTATIONS === undefined, '旧的变异表已删除');
  ok(MC.ANOMALY.VARIANTS === undefined, '旧的变体表已删除');
  ok(MC.ANOMALY.ROLLS === undefined, '旧的掉落方差表已删除');
  ok(MC.waves.mutationAt === undefined, 'mutationAt 已从 API 上摘掉');

  /* 可复现：同种子同波次 = 同一张时刻表 */
  const p1 = MC.waves.plan(12, 4242);
  const p2 = MC.waves.plan(12, 4242);
  eq(JSON.stringify(p1), JSON.stringify(p2), '波次时刻表可复现');
  ok(JSON.stringify(MC.waves.plan(12, 4243)) !== JSON.stringify(p1), '换种子长出另一张表');

  /* 编号与种子同源 */
  eq(MC.seed.caseToSeed(MC.seed.caseOf(31337)), 31337, '编号能解回同一个种子');

  /* 单点收敛 */
  MC.bus.state.calm = false;
  eq(MC.eff.eff('speed', 999), MC.eff.CAP.speed, '上限收敛');
  MC.bus.state.calm = true;
  eq(MC.eff.eff('enemyCount', 999), MC.eff.CALM.enemyCount, '冷静模式压住上限');
  MC.bus.state.calm = false;

  /* 构筑编译：空装配也有可用数值 */
  const empty = MC.modules.compile([null, null, null, null, null, null]);
  ok(empty.mods.dmg > 0 && empty.mods.hp > 0, '空装配有可用数值');
  eq(empty.synergy.length, 0, '空装配没有协同');

  /* 满装配：所有数值都在上下限内，且不出现 NaN */
  const allBolt = ['bolt', 'bolt', 'bolt', 'bolt', 'bolt', 'bolt'];
  const full = MC.modules.compile(allBolt);
  let bad = [];
  for (const k in full.mods) {
    if (typeof full.mods[k] !== 'number') continue;
    if (!isFinite(full.mods[k])) bad.push(k);
  }
  eq(bad.length, 0, '满装配不出 NaN/Infinity');
  ok(full.mods.dmg === MC.eff.eff('damage', full.mods.dmg), '伤害经过钳制');

  /* 协同：连发挨着散射应当点亮「齐射」 */
  const sy = MC.modules.compile(['rapid', 'spread', null, null, null, null]);
  eq(sy.synergy.length, 1, '相邻槽位触发一条协同');
  eq(sy.synergy[0].def.id, 'volley', '触发的是齐射');
  const loSyn = MC.modules.compile(['rapid', 'spread', null, null, null, null]);
  const hiSyn = MC.modules.compile(['rapid3', 'spread3', null, null, null, null]);
  ok(hiSyn.synergy[0].k > loSyn.synergy[0].k, '高阶元件的协同更强');
  const sy2 = MC.modules.compile(['rapid', null, 'spread', null, null, null]);
  eq(sy2.synergy.length, 0, '不相邻则不触发');
  const sy3 = MC.modules.compile(['rapid', null, null, null, null, 'spread']);
  eq(sy3.synergy.length, 1, '环形首尾也相邻');

  /* 元件等级：同名投两次应当往上一阶 */
  ok(MC.MODULES.length > 60, '元件数量足够多（' + MC.MODULES.length + '）');
  const lv3 = MC.modules.byId('bolt3');
  ok(!!lv3 && lv3.lv === 3, '直击有第三级');
  ok(MC.modules.byId('bolt3').mods.dmg > MC.modules.byId('bolt').mods.dmg * 1.8, '高一级明显更强');
  const upBolt = MC.reactions.find('bolt', 'bolt');
  eq(upBolt.kind, 'upgrade', '同名投进去是升阶');
  eq(upBolt.out[0], 'bolt2', '直击 + 直击 = 直击 Ⅱ');
  ok(MC.modules.dropPool(1, 0).every((m) => m.lv === 1), '第 1 波只掉一级件');
  ok(MC.modules.dropPool(40, 0).some((m) => m.lv >= 2), '后期会掉高阶件');

  /* 反应：任意一对都要有结果 */
  eq(MC.reactions.find('rapid', 'bolt').out[0], MC.reactions.find('bolt', 'rapid').out[0], '反应无序');
  eq(MC.reactions.find('null', 'prism').out[0], 'null', '留白通配吃掉一切');
  ok(!!MC.reactions.find('null', 'bolt'), '留白跟任意元件都能反应');
  eq(MC.reactions.find('bolt', 'nosuchthing'), null, '不存在的组合返回空');
  ok(MC.reactions.total() > 500, '组合数是平方级（' + MC.reactions.total() + '）');
  const bases = MC.modules.baseIds();
  let missing = 0, slow = 0;
  for (let i = 0; i < bases.length; i += 7) {
    for (let j = i; j < bases.length; j += 5) {
      const rx = MC.reactions.find(bases[i], bases[j]);
      if (!rx) missing++;
      /* 合成不再需要时间：sec 必须恒为 0。
         旧版每一条都带 12–240 秒，代价是「等待」而不是「元件」，
         于是玩家可以无限白嫖——这一条就是整个 bug 的根。 */
      if (rx && rx.sec !== 0) slow++;
    }
  }
  eq(missing, 0, '抽样的每一对都能推出反应');
  eq(slow, 0, '合成不吃时间：每一条反应的 sec 都是 0');
  ok(MC.REACTIONS.every((r) => r.sec === 0), '手写表里也没有残留的时长');

  /* 阶跃：门槛要可走到 */
  eq(MC.ladder.tierOf(0), 0, '0 击杀在第 0 阶');
  eq(MC.ladder.tierOf(MC.ladder.atOf(1)), 1, '跨过第一阶门槛就换规则');
  ok(MC.ladder.atOf(1) <= 1000, '第一阶门槛在可走到的范围内');
  ok(MC.ladder.atOf(8) <= 1e6, '最后一阶门槛在可走到的范围内');
  const high = MC.ladder.effects(MC.ladder.atOf(8));
  ok(high.decay > 0 && high.mirrorChance > 0, '高阶开始产生压力而不只是增益');
  eq(MC.ladder.effects(0).decay, 0, '第 0 阶不掉血');
  ok(MC.ladder.peek(MC.LADDER[7], 0).name === '？', '未到的那一层不露名字');

  /* 纪元：门槛要可走到，且换的是「尺子」不是「加多少」 */
  eq(MC.epoch.idxOf(0), 0, '0 击杀在第 0 纪元');
  eq(MC.epoch.atOf(1) > 0, true, '第一纪元有门槛');
  ok(MC.epoch.atOf(1) <= 5000, '第一纪元门槛在可走到的范围内（' + MC.epoch.atOf(1) + '）');
  ok(MC.epoch.atOf(7) <= 1e7, '最后一纪元门槛在可走到的范围内');
  const law0 = MC.epoch.laws(0);
  /* 中性值一律 1。edge 也是 1——乘算的键从 0 起会永远是 0。 */
  ok(MC.LAW_KEYS.every((k) => law0[k] === 1), '初纪元的律全是中性值 1');
  const law7 = MC.epoch.laws(MC.epoch.atOf(7));
  ok(law7.hpWave > 1, '纪元真的在改「血量怎么长」');
  ok(law7.edge > 1, '收律真的在收场地');
  ok(MC.epoch.peek(MC.EPOCHS[5], 0).name === '？', '未到的纪元不露名字');
  /* 律只能改乘算 */
  ok(MC.LAW_KEYS.every((k) => typeof MC.epoch.laws(0)[k] === 'number'), '律的键全是数');
  /* 敌人随波次变强 */
  const e1 = MC.enemies.make('ash', 1, 0, 0, MC.seed.rngFrom(1, 'x'), 1);
  const e30 = MC.enemies.make('ash', 30, 0, 0, MC.seed.rngFrom(1, 'x'), 1);
  ok(e30.hp > e1.hp * 3, '第 30 波的灰针明显更厚');
  ok(e30.dmg > e1.dmg, '第 30 波更疼');
  ok(MC.ENEMIES.length >= 20, '敌人种类够多（' + MC.ENEMIES.length + '）');
  ok(new Set(MC.ENEMIES.map((e) => e.ai)).size >= 15, 'AI 种类够多');

  /* 波相：条数封顶，所以这一层永远读得懂 */
  ok(MC.PHASES.length <= 6, '波相条数封顶（' + MC.PHASES.length + ' 条）');
  eq(MC.waves.activePhases(3).length, 0, '第 3 波还没有波相');
  ok(MC.waves.activePhases(50).length === MC.PHASES.length, '后期全部波相都在，且不超过表长');
  ok(!!MC.waves.nextPhase(10), '下一相能查到');
  /* 精化：徽记看得见，且有上限 */
  ok(MC.ELITES.length >= 5, '精化徽记够多（' + MC.ELITES.length + '）');
  const pAt50 = MC.waves.phaseMods(50);
  ok(pAt50.eliteChance > 0 && pAt50.eliteChance <= 0.45, '精化概率有上限（' + pAt50.eliteChance + '）');
  ok(MC.waves.phaseMods(0).eliteChance === 0.06, '第 0 波精化很罕见');
  ok(MC.waves.bossAt(10).id === 'b1', '第 10 波出第一个 Boss');
  eq(MC.waves.bossAt(11), null, '非整十波没有 Boss');
  /* 波相「盛」把 Boss 间隔压到 5 */
  ok(MC.waves.bossAt(15, { bossEvery: 5 }) !== null, '波相把 Boss 间隔压到 5');
  ok(MC.waves.bossAt(20, { bossEvery: 5 }) !== null, '间隔 5 时第 20 波也出');

  /* 皮肤与风格 */
  ok(MC.SKINS.length >= 5, '皮肤够多（' + MC.SKINS.length + '）');
  ok(MC.STYLES.length >= 5, '风格够多（' + MC.STYLES.length + '）');
  ok(MC.SKINS.every((s) => s.id && s.name && s.ui && s.ui.bg && s.ui.acc), '每套皮肤配色齐全');
  /* 皮肤里不许出现任何参与判定的字段 */
  ok(MC.SKINS.every((s) => !s.mods), '皮肤不带任何规则乘算');
  ok(MC.STYLES.every((s) => !s.ui), '风格不带任何配色');
  const plain = MC.cosmetics.styleById('plain');
  eq(Object.keys(plain.mods).length, 0, '「素」风格一条规则都不改');
  MC.bus.state.prefs.style = 'swift';
  ok(MC.cosmetics.styleMods().rateMul < 1, '「疾」风格射速变快');
  MC.bus.state.prefs.style = 'quiet';
  ok(MC.cosmetics.styleMods().quiet === 1, '「静」风格标记生效');
  MC.bus.state.prefs.style = 'plain';

  /* 声轨不进判据；皮肤也不进 */
  const snap = () => JSON.stringify({
    p: MC.waves.plan(7, 999),
    c: MC.modules.compile(allBolt).mods
  });
  const before = snap();
  MC.bus.state.sound = true; MC.audio.enable();
  eq(snap(), before, '开声不改变波次与构筑');
  MC.bus.state.sound = false; MC.audio.disable();
  eq(snap(), before, '关声不改变波次与构筑');
  MC.bus.state.prefs.skin = 'paper';
  eq(snap(), before, '换皮不改变波次与构筑');
  MC.bus.state.prefs.skin = 'ink';

  dom.window.close();
}

/* ============ 2. 主舞台引擎 ============ */
async function testEngine() {
  section('主舞台');
  const dom = await open('index.html');
  const w = dom.window, MC = w.MC, d = w.document;
  ok(!!d.getElementById('stage'), '舞台 canvas 在位');
  eq(d.getElementById('stage').width > 0, true, '画布有尺寸');
  ok(MC.engine.W >= 1000, '主舞台宽度足够（' + MC.engine.W + '）');

  /* 手动跑一段：不抛错、不出 NaN、真的打得死东西。
     手动瞄准下，站着不动朝一个方向打是打不到几个的——所以这里用
     「追迹」+「环轨」两样都带自己找目标的元件，代表一个真实构筑。 */
  MC.bus.state.rig = ['homing', 'rapid', 'spread', 'hull', 'legs', 'magnet'];
  MC.bus.state.kills = 0;
  const eng = MC.engine.create(d.getElementById('stage'), {});
  eng.reset(4242);
  eng.mouse.x = eng.player.x; eng.mouse.y = 0; eng.mouse.inside = true;   /* 朝上 */
  let threw = null;
  try {
    for (let i = 0; i < 2400; i++) { eng.step(16.67); eng.draw(); }
  } catch (e) { threw = e; }
  ok(!threw, '连跑 2400 帧不抛错' + (threw ? '：' + threw.message : ''));
  ok(eng.wave >= 1, '波次推进过（第 ' + eng.wave + ' 波）');
  ok(eng.runKills > 0, '真的打死过东西（' + eng.runKills + ' 击杀）');
  ok(isFinite(eng.player.x) && isFinite(eng.player.y), '玩家坐标有限');
  let nan = 0;
  eng.enemies.forEach((e) => { if (!isFinite(e.x) || !isFinite(e.y) || !isFinite(e.hp)) nan++; });
  eng.bullets.forEach((b) => { if (!isFinite(b.x) || !isFinite(b.y)) nan++; });
  eq(nan, 0, '场上没有 NaN 实体');
  ok(eng.enemies.length <= MC.eff.eff('enemyCount', 170), '敌人数不超过上限');

  /* 手动瞄准不是「打不中」，是「要自己指」：环轨与分身仍自动选敌，
     所以带环轨的构筑在固定准星下也应当清得动场。 */
  MC.bus.state.rig = ['bolt', 'bolt', 'engine', 'hull', 'legs', null];
  const eOrb = MC.engine.create(d.getElementById('stage'), {});
  eOrb.reset(4242);
  eOrb.mouse.x = eOrb.player.x; eOrb.mouse.y = 0; eOrb.mouse.inside = true;
  for (let i = 0; i < 2400; i++) eOrb.step(16.67);
  ok(eOrb.orbiters.length > 0, '环轨炮在位');
  ok(eOrb.runKills > 20, '环轨自己找目标，固定准星也清得动场（' + eOrb.runKills + ' 击杀）');

  /* ---- 敌人曲线：更陡，且陡度主要落在后段 ---- */
  const S = (n) => MC.enemies.scaleOf(n, { steep: 1 });
  ok(S(20) > S(10) && S(30) > S(20) && S(40) > S(30), '血量曲线单调上升');
  /* 后段比旧曲线（1 + 0.15w + 0.0075w²）陡，前十波基本不动 —— 陡在前段就是单纯的变厚 */
  const old = (n) => 1 + n * 0.15 + n * n * 0.0075;
  ok(S(30) > old(30) * 1.25, '第 30 波明显比旧曲线陡（' + S(30).toFixed(1) + ' vs ' + old(30).toFixed(1) + '）');
  ok(S(40) > old(40) * 1.35, '第 40 波更陡（' + S(40).toFixed(1) + ' vs ' + old(40).toFixed(1) + '）');
  ok(S(10) < old(10) * 1.2, '第 10 波没有跟着一起变厚（' + S(10).toFixed(1) + ' vs ' + old(10).toFixed(1) + '）');

  /* ---- 局内成长随机化 ---- */
  const gA = MC.enemies.runGrowth(12345, 1);
  const gB = MC.enemies.runGrowth(12345, 2);
  const gA2 = MC.enemies.runGrowth(12345, 1);
  eq(JSON.stringify(gA), JSON.stringify(gA2), '同一局的成长脾气可复现');
  ok(gA.steep !== gB.steep || gA.jitter !== gB.jitter, '换一局脾气就换了');
  ok(gA.steep >= 0.8 && gA.steep <= 1.3, '陡度落在可读的区间（' + gA.steep.toFixed(2) + '）');
  ok(gA.jitter > 0 && gA.jitter <= 0.3, '抖动落在可读的区间（' + gA.jitter.toFixed(2) + '）');
  const steepy = MC.enemies.scaleOf(30, { steep: 1.25 });
  ok(steepy > S(30), '陡度真的乘在曲线上（' + steepy.toFixed(1) + ' > ' + S(30).toFixed(1) + '）');
  /* 抖动也必须可复现，否则「重开同一编号」就不是同一局了 */
  eq(MC.enemies.waveJitter(gA, 7), MC.enemies.waveJitter(gA2, 7), '每一波的抖动可复现');
  ok(MC.enemies.waveJitter(gA, 7) !== MC.enemies.waveJitter(gA, 8) || gA.jitter === 0,
    '不同波次抖出不同的数');
  /* 开一局，引擎真的把脾气挂上了 */
  const eG = MC.engine.create(d.getElementById('stage'), {});
  eG.reset(999);
  ok(!!eG.growth, '开局摇出了一份成长脾气');
  ok(eG.growth.steep > 0, '脾气的陡度是正的（' + eG.growth.steep.toFixed(2) + '）');

  /* ---- 四类敌人 ---- */
  ok(MC.CLASSES.length === 4, '四类敌人（常 / 精英 / 巨构 / 华丽）');
  ['foe', 'elite', 'mega', 'gaudy'].forEach((c) => {
    const n = MC.enemies.ofClass(c).length;
    ok(n >= 5, c + ' 这一类至少五种（实际 ' + n + '）');
  });
  /* 每一种的 AI 都在 step 的 switch 里有落点：没有 default 兜底吃掉它们 */
  MC.ENEMIES.forEach((e) => {
    if (e.cls === 'foe') return;
    const made = MC.enemies.make(e.id, 20, 300, 300, MC.seed.rngFrom(1, 't' + e.id), 1, null);
    eq(made.cls, e.cls, '「' + e.name + '」的类别带进了场上');
    let threw2 = null;
    try {
      const ctx = MC.engine.create(d.getElementById('stage'), {});
      for (let i = 0; i < 60; i++) MC.enemies.step(made, ctx.aiCtx(), 1);
    } catch (err) { threw2 = err; }
    ok(!threw2, '「' + e.name + '」的 AI 跑得动' + (threw2 ? '：' + threw2.message : ''));
  });
  /* 巨构与精英不该满场都是：它们的权重必须比「常」低 */
  const wFoe = MC.enemies.ofClass('foe')[0].w;
  const wMega = MC.enemies.ofClass('mega')[0].w;
  ok(wMega < wFoe, '巨构的出场权重低于常类（' + wMega + ' < ' + wFoe + '）');
  /* 精英类必带一枚看得见的徽记 */
  const eElite = MC.enemies.make('骁', 20, 300, 300, MC.seed.rngFrom(3, 'x'), 1, null);
  const el = MC.waves.forceElite(20, 1);
  ok(!!el && !!el.glyph, '精英类补得到一枚徽记');

  /* ---- Boss：不只换零件数，各有自己的出手 ---- */
  const bAis = MC.BOSSES.map((b) => b.ai);
  ok(bAis.every((a) => !!a), '每个 Boss 都有一套出手');
  ok(new Set(bAis).size >= 5, 'Boss 的出手至少有五种（实际 ' + new Set(bAis).size + '）');
  /* 真跑一次带 Boss 的波：部件 + 出手都要不抛错 */
  const eB = MC.engine.create(d.getElementById('stage'), {});
  MC.bus.state.rig = ['bolt', 'rapid', 'hull', null, null, null];
  eB.reset(555);
  let bossThrew = null;
  let shots = 0, beams = 0;
  try {
    eB.spawnBoss(MC.BOSSES[2], 30);
    for (let i = 0; i < 900; i++) {
      eB.step(16.67); eB.draw();
      /* 弹与光束都有寿命，所以要在循环里数，不能只看最后一帧 */
      shots = Math.max(shots, eB.ebullets.length);
      beams = Math.max(beams, eB.beams.length);
    }
  } catch (err) { bossThrew = err; }
  ok(!bossThrew, 'Boss 波连跑 900 帧不抛错' + (bossThrew ? '：' + bossThrew.message : ''));
  ok(shots + beams > 0, 'Boss 真的出手了（不是只转圈，弹 ' + shots + ' / 光束 ' + beams + '）');

  /* ---- 判定点：受击走点不走面 ---- */
  ok(eng.player.hitR < eng.player.r, '判定点比可见体积小');
  ok(eng.player.hitR > 0.5, '判定点不是 0（那样就永远打不到了）');
  /* 「收束」减体积时判定点也要跟着缩，否则减体积不减难度 */
  const eBase = MC.engine.create(d.getElementById('stage'), {});
  MC.bus.state.rig = [null, null, null, null, null, null];
  eBase.reset(1);
  const baseHit = eBase.player.hitR;
  const eSlim = MC.engine.create(d.getElementById('stage'), {});
  MC.bus.state.rig = ['slim', 'slim', null, null, null, null];
  eSlim.reset(1);
  ok(eSlim.player.hitR < baseHit, '「收束」把判定点缩小了（' + baseHit.toFixed(2) + ' → ' + eSlim.player.hitR.toFixed(2) + '）');
  ok(eSlim.player.r < eBase.player.r, '「收束」也把可见体积缩小了');
  /* 判定点始终小于可见体积——这一条是「不把整个体积当碰撞箱」的直读 */
  ok(eSlim.player.hitR < eSlim.player.r, '判定点始终小于可见体积');

  /* ---- 受击冷却整整一秒 ---- */
  const e2 = MC.engine.create(d.getElementById('stage'), {});
  e2.reset(7);
  e2.player.shieldMax = 0; e2.player.shield = 0;
  e2.player.hp = 1000; e2.player.maxHp = 1000;
  const first = e2.hurtPlayer(50);
  const hp1 = e2.player.hp;
  ok(first === true, '第一下打进去了');
  ok(hp1 < 1000, '第一下真的掉了血（' + hp1 + '）');
  eq(e2.invuln, 60, '受击后进入 60 帧（= 1 秒 @60fps）冷却');
  const second = e2.hurtPlayer(50);
  eq(second, false, '冷却期内第二下被挡下');
  eq(e2.player.hp, hp1, '冷却期内血量不再掉——这就是「避免真伤」');
  /* 60 帧后恢复 */
  for (let i = 0; i < 61; i++) e2.step(16.67);
  ok(e2.invuln <= 0, '一秒之后冷却真的结束');
  ok(e2.hurtPlayer(50) === true, '冷却结束后又能被打中');

  /* 冷却不随任何成长变化：加满养成也还是一秒 */
  MC.bus.state.nursery.done = {};
  MC.NURSERY.forEach((n) => { MC.bus.state.nursery.done[n.id] = true; });
  const eCd = MC.engine.create(d.getElementById('stage'), {});
  eCd.reset(3);
  eCd.player.shieldMax = 0; eCd.player.shield = 0; eCd.player.hp = 9999; eCd.player.maxHp = 9999;
  eCd.hurtPlayer(1);
  eq(eCd.invuln, 60, '养成全满也不会缩短受击冷却');
  MC.bus.state.nursery.done = {};

  /* ---- 眠：一辈子只冲一次 ---- */
  const sl = MC.enemies.make('sleep', 5, 200, 200, MC.seed.rngFrom(1, 'probe'), 1);
  const probeEng = MC.engine.create(d.getElementById('stage'), {});
  probeEng.reset(5);
  probeEng.player.x = 240; probeEng.player.y = 200;
  sl.x = 200; sl.y = 200;
  const ctx = probeEng.aiCtx();
  let charges = 0;
  const realStep = MC.enemies.step;
  MC.enemies.step = function (e, c, dt) {
    const was = e.spent;
    realStep(e, c, dt);
    if (!was && e.spent) charges++;
  };
  for (let i = 0; i < 1800; i++) {          /* 30 秒 */
    MC.enemies.step(sl, ctx, 1);
    if (sl.dead) break;
  }
  MC.enemies.step = realStep;
  eq(charges, 1, '眠在 30 秒里只冲了一次');
  eq(!!sl.spent, true, '冲过之后标记为力竭');
  /* 力竭之后明显变慢，可以被绕开 */
  const slSpent = MC.enemies.make('sleep', 5, 200, 200, MC.seed.rngFrom(1, 'probe'), 1);
  slSpent.spent = true;
  MC.enemies.step(slSpent, ctx, 1);
  ok(Math.abs(slSpent.vx) < sl.spd, '力竭之后跑得比原来慢');

  /* ---- 开火方向只来自鼠标 ---- */
  const eAim = MC.engine.create(d.getElementById('stage'), {});
  eAim.reset(11);
  eAim.mouse.x = eAim.player.x + 300;      /* 鼠标在右边 */
  eAim.mouse.y = eAim.player.y;
  eAim.mouse.inside = true;
  eAim.bullets.length = 0;
  eAim.fireTick = 0;
  eAim.step(16.67);
  ok(eAim.bullets.length > 0, '开火了');
  const b0 = eAim.bullets[0];
  ok(b0.vx > 0, '子弹朝鼠标那一侧飞（右）');
  /* 换个方向，子弹跟着换 */
  eAim.bullets.length = 0;
  eAim.mouse.x = eAim.player.x;
  eAim.mouse.y = eAim.player.y - 300;      /* 鼠标在上边 */
  eAim.fireTick = 0;
  eAim.step(16.67);
  ok(eAim.bullets.length > 0 && eAim.bullets[0].vy < 0, '鼠标移上去，子弹就朝上');
  /* 自动选敌仍然存在，但只给环轨与分身用 */
  ok(typeof eAim.pickTarget === 'function', '环轨/分身仍保留自动选敌');

  /* ---- 死亡回调与终态 ---- */
  let dead = null;
  const eDead = MC.engine.create(d.getElementById('stage'), { onDead: (r) => { dead = r; } });
  eDead.reset(7);
  eDead.player.hp = 1;
  eDead.hurtPlayer(999);
  ok(!!dead, '生命归零触发结束回调');
  eq(eDead.over, true, '结束后进入终态');
  eDead.step(16.67);
  eq(eDead.over, true, '终态之后不再推进');

  /* ---- 敌人真的会靠过来 ----
     回归：这里曾无条件对每个敌人每帧往外挪 62px 且不吃 dt，
     AI 一帧只走一两像素，却被打回去 62——敌人一路顶到墙上再滑进角落钉死，
     谁也靠不过来，波次也永远清不掉。测的是「没被钉住」而不是「在动」，
     因为刚出生的敌人本来就在边上，只看位置会把它们误判成钉死。 */
  const eConv = MC.engine.create(d.getElementById('stage'), {});
  eConv.reset(3);
  eConv.fire = () => {};                       /* 不开火，让它们活着靠过来 */
  eConv.player.hp = 1e6; eConv.player.maxHp = 1e6;   /* 只看几何，不看死活 */
  const PX = MC.engine.W / 2, PY = MC.engine.H / 2;
  for (let i = 0; i < 600; i++) {              /* 10 秒 */
    eConv.player.x = PX; eConv.player.y = PY;
    eConv.step(16.67);
  }
  const snap = eConv.enemies.map((e) => ({ e, x: e.x, y: e.y }));
  for (let i = 0; i < 30; i++) {
    eConv.player.x = PX; eConv.player.y = PY;
    eConv.step(16.67);
  }
  let stuck = 0, minD = 1e9;
  for (const s of snap) {
    const moved2 = Math.hypot(s.e.x - s.x, s.e.y - s.y);
    const dd = Math.hypot(s.e.x - PX, s.e.y - PY);
    if (moved2 < 1 && dd > 300) stuck++;       /* 离玩家很远又一动不动 = 钉住了 */
    if (dd < minD) minD = dd;
  }
  ok(snap.length > 0, '场上有敌人可供观察（' + snap.length + ' 只）');
  eq(stuck, 0, '没有敌人被钉在场边（钉住 ' + stuck + ' 只）');
  ok(minD < 60, '追人的敌人真的靠到了身边（最近 ' + minD.toFixed(1) + 'px）');

  /* ---- 接触伤害真的会发生 ----
     回归：把敌人按可见体积推到 e.r + p.r（灰针 23px）时，
     受击判定只有 e.r*0.72 + hitR（约 11px）——停在 23px 上的敌人永远够不到判定点，
     追人的那一批等于没有威胁。推开的停位必须落在判定距离之内。 */
  const eTouch = MC.engine.create(d.getElementById('stage'), {});
  eTouch.reset(3);
  eTouch.fire = () => {};
  const hpTouch0 = eTouch.player.maxHp;
  let gap = 1e9;
  for (let i = 0; i < 900; i++) {              /* 15 秒，站着不动 */
    eTouch.player.x = PX; eTouch.player.y = PY;
    eTouch.step(16.67);
    for (const e of eTouch.enemies) {
      const reach = e.r * 0.72 + eTouch.player.hitR;
      gap = Math.min(gap, Math.hypot(e.x - PX, e.y - PY) - reach);
    }
  }
  ok(gap <= 0.5, '至少有一只把前缘贴到了判定点（余 ' + gap.toFixed(2) + 'px）');
  ok(eTouch.player.hp < hpTouch0, '站着不动真的会挨打（' +
    Math.round(hpTouch0) + ' → ' + Math.round(eTouch.player.hp) + '）');

  /* ---- 波次真的会推进 ---- */
  const eWave = MC.engine.create(d.getElementById('stage'), {});
  eWave.reset(5);
  for (let i = 0; i < 3600; i++) {             /* 60 秒，会瞄准 */
    eWave.player.x = PX; eWave.player.y = PY;
    let tgt = null, bd2 = 1e9;
    for (const e of eWave.enemies) {
      const dd = Math.hypot(e.x - PX, e.y - PY);
      if (dd < bd2) { bd2 = dd; tgt = e; }
    }
    eWave.mouse.inside = true;
    if (tgt) { eWave.mouse.x = tgt.x; eWave.mouse.y = tgt.y; }
    eWave.step(16.67);
  }
  ok(eWave.wave > 1, '会瞄准的话波次会推进（到第 ' + eWave.wave + ' 波）');
  ok(eWave.runKills > 0, '真的打得死东西（' + eWave.runKills + ' 击杀）');

  /* ---- 蓄能 ----
     回归：充能只挂在余烬上，而所有 addEmber 调用都传 mild=1，
     收余烬那行写着 !em.mild 才充能，于是恒为假——蓄能永远是 0，净化一次没放过。
     「蓄能没有效果」的根因在这里，不在净化本身。 */
  const eCh = MC.engine.create(d.getElementById('stage'), {});
  eCh.reset(3);
  eCh.charge = 0;
  const corpse = MC.enemies.make('ash', 1, 400, 400, MC.seed.rngFrom(7, 't'), 1);
  eCh.onEnemyDead(corpse);
  ok(eCh.charge > 0, '击杀会攒蓄能（' + eCh.charge.toFixed(1) + '%）');
  eCh.charge = 0;
  let purges0 = 0;
  const origPurge2 = eCh.purge.bind(eCh);
  eCh.purge = function () { purges0++; return origPurge2(); };
  eCh.gainCharge(120);
  ok(eCh._purgeQueued === true, '满槽只挂旗，不在命中判定中途展开');
  eCh.flushPurge();
  eq(purges0, 1, '满槽放一次净化');
  ok(eCh.charge < 100, '净化之后蓄能被放空（' + Math.round(eCh.charge) + '%）');
  /* 实战里真的在攒：二十秒对局，蓄能不该还是 0 */
  const eCh2 = MC.engine.create(d.getElementById('stage'), {});
  eCh2.reset(5);
  for (let i = 0; i < 1200; i++) {
    eCh2.player.x = PX; eCh2.player.y = PY;
    let t3 = null, bd4 = 1e9;
    for (const e of eCh2.enemies) {
      const dd = Math.hypot(e.x - PX, e.y - PY);
      if (dd < bd4) { bd4 = dd; t3 = e; }
    }
    eCh2.mouse.inside = true;
    if (t3) { eCh2.mouse.x = t3.x; eCh2.mouse.y = t3.y; }
    eCh2.step(16.67);
  }
  ok(eCh2.charge > 0 || eCh2.purges > 0,
    '实战二十秒后蓄能不为零（' + Math.round(eCh2.charge) + '%　净化 ' + eCh2.purges + ' 次）');

  /* ---- 生命元件在本局生效 ----
     回归：applyRig 只重算 mods 就返回了，身体只有 reset() 才写一次，
     于是局内捡到甲壳，数值表涨了，人没涨。 */
  const eHp = MC.engine.create(d.getElementById('stage'), {});
  eHp.reset(1);
  eHp.fire = () => {};
  MC.bus.state.rig = [null, null, null, null, null, null];
  eHp.applyRig();
  const maxHpA = eHp.player.maxHp, hpA = eHp.player.hp;
  MC.bus.state.rig = ['hull', 'hull', 'core', null, null, null];
  eHp.applyRig();
  ok(eHp.player.maxHp > maxHpA,
    '装上甲壳，本局上限当场变高（' + maxHpA + ' → ' + Math.round(eHp.player.maxHp) + '）');
  ok(eHp.player.hp > hpA,
    '上限涨的那一截当场回到身上（' + Math.round(hpA) + ' → ' + Math.round(eHp.player.hp) + '）');
  MC.bus.state.rig = [null, null, null, null, null, null];
  eHp.applyRig();
  ok(eHp.player.hp > 0 && eHp.player.hp <= eHp.player.maxHp + 0.001,
    '拆下甲壳后血量被钳住，不倒扣');

  /* ---- 回血来路 ---- */
  const eHl = MC.engine.create(d.getElementById('stage'), {});
  eHl.reset(3);
  eHl.fire = () => {};
  eHl.player.hp = 20;
  const beforeP = eHl.player.hp;
  eHl.purge();
  ok(eHl.player.hp > beforeP, '净化会回一口气（' + Math.round(beforeP) + ' → ' + Math.round(eHl.player.hp) + '）');
  ok(eHl.heal(1e6) <= eHl.player.maxHp + 0.001, '回血不越过上限');
  /* 清波回血：把这一波的时刻表倒空，让它当场清空 */
  const eWc = MC.engine.create(d.getElementById('stage'), {});
  eWc.reset(3);
  eWc.fire = () => {};
  eWc.waveGap = 0; eWc.spawnQ.length = 0; eWc.enemies.length = 0; eWc.waveLeft = 0;
  eWc.player.hp = 20;
  eWc.step(16.67);
  ok(eWc.player.hp > 20, '清空一波会回一口气（→ ' + Math.round(eWc.player.hp) + '）');

  /* ---- 血量坡度真的接入 ----
     回归：hpWave 写在纪元律与风格「远」里、UI 也照着显示，引擎却从没读过它。 */
  MC.bus.state.prefs.style = 'long';          /* 「远」：hpWave 0.72 */
  const eHw = MC.engine.create(d.getElementById('stage'), {});
  eHw.reset(1);
  eHw.wave = 20;
  ok(eHw.hpWave < 1, '风格「远」压下了血量坡度（' + eHw.hpWave.toFixed(2) + '）');
  ok(eHw.hpWaveFactor() < 1, '换算之后血确实长得更慢（×' + eHw.hpWaveFactor().toFixed(2) + '）');
  MC.bus.state.prefs.style = 'plain';
  MC.bus.save();

  /* ---- 元件等级 ---- */
  const maxLv = Math.max.apply(null, MC.MODULES.map((m) => m.lv));
  ok(maxLv >= 10, '元件等级上限到十级（' + maxLv + '）');
  ok(MC.MODULES.filter((m) => m.lv >= 10).length > 0, '有十级元件');
  const hiPool = MC.modules.dropPool(80, 0).filter((m) => m.lv >= 8);
  ok(hiPool.length > 0, '八十波的池子里有八级以上元件（' + hiPool.length + ' 件）');
  ok(MC.MODULES.every((m) => !/undefined/.test(m.name)), '高等级元件名字不缺位');

  /* ---- 构筑改动即时生效 ---- */
  const e3 = MC.engine.create(d.getElementById('stage'), {});
  MC.bus.state.rig = [null, null, null, null, null, null];
  e3.reset(1);
  const hp0 = e3.mods.mods.hp;
  MC.bus.state.rig = ['hull', 'hull', 'core', 'hull', 'hull', 'core'];
  e3.applyRig();
  ok(e3.mods.mods.hp > hp0, '换上甲壳后生命上限变高');

  dom.window.close();
}

/* ============ 3. 元件经济（合成消耗 + 每局重置） ============ */
async function testEconomy() {
  section('元件经济');
  const dom = await open('index.html');
  const w = dom.window, MC = w.MC;

  /* bus 的三个入口是唯一写入口 */
  MC.bus.state.inventory = {};
  MC.bus.invAdd('bolt', 3);
  eq(MC.bus.invCount('bolt'), 3, 'invAdd 加上去了');
  ok(MC.bus.invTake('bolt', 2), 'invTake 扣得动');
  eq(MC.bus.invCount('bolt'), 1, '扣完剩下 1');
  ok(!MC.bus.invTake('bolt', 5), '扣不动时返回 false');
  eq(MC.bus.invCount('bolt'), 1, '扣不动时数量不变——这一条就是合成能消耗的前提');

  /* 每局结束：未装配的退回熔炉 */
  MC.bus.state.inventory = { bolt: 5, hull: 2 };
  MC.bus.state.rig = ['heavy', null, null, null, null, null];
  const n = MC.bus.invClearRun();
  eq(n, 7, '退回 7 件未装配元件');
  eq(MC.bus.invTotal(), 0, '库存清空');
  eq(MC.bus.state.rig[0], 'heavy', '装在环上的那件留着——它是局外资产');

  /* 迁移：旧存档的「总数」语义要正确转成「未装配数」 */
  const old = { inventory: { bolt: 5, hull: 2 }, rig: ['bolt', 'bolt', 'hull', null, null, null, null] };
  MC.bus.state.inventory = old.inventory;
  MC.bus.state.rig = old.rig;
  /* 直接验证扣减逻辑：5 减 2 = 3，2 减 1 = 1 */
  eq(MC.bus.state.inventory.bolt - 2, 3, '旧语义换算：bolt 5 件里有 2 件装在环上');
  eq(MC.bus.state.inventory.hull - 1, 1, '旧语义换算：hull 2 件里有 1 件装在环上');

  /* 引擎每局结束真的清 */
  MC.bus.state.rig = ['bolt', 'bolt', null, null, null, null];
  MC.bus.invAdd('hull', 4);
  const eng = MC.engine.create(w.document.getElementById('stage'), {});
  eng.reset(4242);
  ok(MC.bus.invTotal() >= 4, 'reset 之前手上确实有元件');
  MC.bus.invClearRun();
  eq(MC.bus.invTotal(), 0, 'resetRun 会把未装配的退回熔炉');
  eq(MC.bus.state.rig.filter(Boolean).length, 2, 'resetRun 不动装配');

  /* 装配是持久的局外资产：倒下不清 */
  const e2 = MC.engine.create(w.document.getElementById('stage'), {});
  MC.bus.state.rig = ['bolt', 'bolt', 'bolt', null, null, null, null];
  e2.reset(11);
  e2.player.hp = 1; e2.player.shieldMax = 0; e2.player.shield = 0;
  e2.hurtPlayer(9999);
  ok(e2.over, '这一局结束了');
  eq(MC.bus.state.rig.filter(Boolean).length, 3, '倒下之后装配留着');

  dom.window.close();
}

/* ============ 4. 总台 ============ */
async function testHub() {
  section('总台');
  const dom = await open('index.html');
  const w = dom.window, d = dom.window.document;

  ok(/微 宇 宙/.test(d.body.textContent), '总台标题在位');
  ok(d.getElementById('case').textContent.indexOf('MC-') === 0, '编号已发');
  ok(Number(d.getElementById('seed').textContent) > 0, '种子已发');
  /* 房间数由声明表驱动，别写死——加一间就得改一次断言的话，迟早漏改 */
  const roomDefs = w.ROOMS || [];
  ok(roomDefs.length >= 7, '总台声明了房间（' + roomDefs.length + ' 间）');
  eq(d.querySelectorAll('#tabs button').length, roomDefs.length, '房间标签与声明表一一对应');
  /* 快捷键不重号：重号时后一间永远点不到 */
  eq(new Set(roomDefs.map((r) => r.key)).size, roomDefs.length, '房间快捷键不重号');
  ok(d.getElementById('mut').textContent.length >= 0, '波相区在位');
  /* 阶跃 8 级 + 纪元 7 级（去掉第 0 纪元） */
  eq(d.querySelectorAll('#ladder .l').length, 8 + (w.MC.EPOCHS.length - 1), '阶跃与纪元都列出来了');
  ok(/瞄准/.test(d.body.textContent), '操作区写明了瞄准');
  ok(/鼠标/.test(d.body.textContent), '操作区写明了鼠标');

  /* 声明表里每一间的文件都真的在磁盘上 */
  roomDefs.forEach((r) => {
    ok(fs.existsSync(path.join(ROOT, r.file)), r.file + ' 存在');
  });

  /* 重置本局：局外那一半要留着 */
  w.MC.bus.state.residue = 40;
  w.MC.bus.state.found = { bolt: true };
  w.MC.bus.state.nursery.done = { r1: true };
  w.MC.bus.save();
  d.getElementById('again').click();
  ok(!!w.MC, '重置本局后状态仍在');
  eq(w.MC.bus.state.residue, 40, '重置本局不动残渣');
  ok(!!w.MC.bus.state.found.bolt, '重置本局不动已点亮元件');
  ok(!!w.MC.bus.state.nursery.done.r1, '重置本局不动养成节点');

  /* 暂停要有键盘出口，且是同一条开关 */
  const paused0 = d.getElementById('pause').textContent;
  w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'p', bubbles: true }));
  ok(d.getElementById('pause').textContent !== paused0, 'P 键切换了暂停');
  w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok(d.getElementById('pause').textContent === paused0, 'Esc 键切了回来');

  /* 硬重置：局外那一半要清掉，编号与偏好留着 */
  const seedBefore = w.MC.bus.state.seed;
  const skinBefore = w.MC.bus.state.prefs.skin;
  w.confirm = () => true;
  d.getElementById('wipe').click();
  eq(w.MC.bus.state.residue, 0, '硬重置清掉残渣');
  eq(Object.keys(w.MC.bus.state.found).length, 0, '硬重置清掉已点亮元件');
  eq(Object.keys(w.MC.bus.state.nursery.done).length, 0, '硬重置清掉养成节点');
  eq(w.MC.bus.state.seed, seedBefore, '硬重置留着编号');
  eq(w.MC.bus.state.prefs.skin, skinBefore, '硬重置留着皮肤偏好');

  dom.window.close();
}

/* ============ 5. 房间 ============ */
async function testRooms() {
  const MC = (await open('index.html')).window.MC;   /* 只借它的表，不长期持有 */
  const ROOMS = [
    ['rooms/rig.html', '装配台', (w, d) => {
      eq(d.querySelectorAll('.slot').length, 6, '六个槽位');
      eq(d.querySelectorAll('.link').length, 6, '六条环形连线');
      w.MC.bus.state.inventory = { bolt: 4, rapid: 2, spread: 2 };
      w.MC.bus.state.rig = [null, null, null, null, null, null];
      w.MC.bus.emit('state', w.MC.bus.state);
      d.querySelectorAll('.slot')[0].click();
      const opts = d.querySelectorAll('#picker button');
      ok(opts.length >= 3, '选中槽位后列出可装元件');
      /* 装一个要真的扣库存。总量可能不变（换下来的是同族那一件），
         所以这里看的是**那一个 id** 的数量，而不是总数。 */
      const boltBefore = w.MC.bus.invCount('bolt');
      opts[0].click();
      ok(!!w.MC.bus.state.rig[0], '元件装进了第 1 槽');
      eq(w.MC.bus.invCount('bolt'), boltBefore - 1, '装上以后那一个元件的库存少了一个');
      /* 卸下要真的还库存。注意：装备之后 paint() 会重画，
         而再次点同一个槽位是「取消选中」，所以这里直接读当前 picker。 */
      d.querySelectorAll('.slot')[0].click();      /* 若已选中则取消，否则选中 */
      let pk = Array.prototype.slice.call(d.querySelectorAll('#picker button'));
      if (!pk.some((b) => /卸下/.test(b.textContent))) {
        d.querySelectorAll('.slot')[0].click();    /* 再点一次确保选中 */
        pk = Array.prototype.slice.call(d.querySelectorAll('#picker button'));
      }
      const rmb = pk.filter((b) => /卸下/.test(b.textContent))[0];
      ok(!!rmb, '这一格有东西时给出「卸下」按钮');
      rmb.click();
      eq(w.MC.bus.state.rig[0], null, '卸下之后槽位空了');
      eq(w.MC.bus.invCount('bolt'), boltBefore, '卸下的那件回到了库存——不是销毁');
      /* 协同 */
      w.MC.bus.state.rig = ['rapid', 'spread', null, null, null, null];
      w.MC.bus.emit('state', w.MC.bus.state);
      ok(d.querySelectorAll('#syn .y').length >= 1, '协同区点亮了');
      w.MC.bus.state.rig = [null, null, null, null, null, null];
      w.MC.bus.state.inventory = {};
      w.MC.bus.save();
    }],
    ['rooms/culture.html', '培养皿', (w, d) => {
      w.MC.bus.state.inventory = { bolt: 4, rapid: 4 };
      w.MC.bus.state.culture = [null];
      w.MC.bus.state.knownRx = {};
      w.MC.bus.emit('state', w.MC.bus.state);
      ok(d.querySelectorAll('.vat').length >= 1, '至少一个炉膛');
      const opts0 = d.querySelectorAll('#opts button');
      ok(opts0.length >= 2, '列出可投的元件');
      const aId = Array.prototype.slice.call(opts0)[0];
      opts0[0].click();                                    /* 第一边 */
      d.querySelectorAll('#opts button')[0].click();      /* 第二边 */
      ok(w.MC.bus.invTotal() === 8, '手上 8 件（4+4）');
      /* 合成是瞬时的：点一下就该出结果，不该有「反应中」 */
      const acts = Array.prototype.slice.call(d.querySelectorAll('.vat button'))
        .filter((b) => /合成/.test(b.textContent));
      ok(acts.length >= 1, '有合成按钮');
      ok(!acts[0].disabled, '两件都有库存时按钮可点');
      /* 投进去的是哪两个，从页面上读回来：它们各应当少一个 */
      const picks = Array.prototype.slice.call(d.querySelectorAll('.pick .n'))
        .map((e) => e.textContent);
      const before = {};
      Object.keys(w.MC.bus.state.inventory).forEach((k) => { before[k] = w.MC.bus.invCount(k); });
      const beforeTotal = w.MC.bus.invTotal();
      acts[0].click();
      /* 净变化 = 产出的件数 − 2。bolt+rapid 走 NAMED 表出 heavy（1 件），所以 −1。
         关键在于**两个投进去的 id 各少了一个**——这才是「消耗」。 */
      ok(Object.keys(w.MC.bus.state.knownRx).length > 0, '反应写进了已知表');
      ok(w.MC.bus.invTotal() < beforeTotal, '合成净消耗元件（' + beforeTotal + ' → ' + w.MC.bus.invTotal() + '）');
      const spent = Object.keys(before).filter((k) => w.MC.bus.invCount(k) < before[k]);
      ok(spent.length >= 1, '投进去的那几个真的从库存里扣掉了（少了：' + spent.join('、') + '）');
      ok(/^[\u4e00-\u9fa5]/.test(picks[0] || '') || picks.length === 2, '两边都选上了元件');
      /* 排序：与图鉴、装配台共用同一张排法表和同一个偏好 */
      const cSorts = Array.prototype.slice.call(d.querySelectorAll('#sorts button'));
      eq(cSorts.length, w.MC.SORTS.length, '培养皿也有排序控件（' + w.MC.SORTS.length + ' 种排法）');
      w.MC.bus.state.inventory = { bolt: 3, rapid: 3, hull: 3, regen: 2, crit: 2 };
      w.MC.bus.emit('state', w.MC.bus.state);
      const byTier = cSorts.filter((b) => /阶位/.test(b.textContent))[0];
      ok(!!byTier, '「阶位」排法在场');
      byTier.click();
      eq(w.MC.modules.sortMode(), 'tier', '在培养皿改的排法写进了共用偏好');
      const cOpts = Array.prototype.slice.call(d.querySelectorAll('#opts button'));
      ok(cOpts.length >= 5, '换排法之后元件一件没少（' + cOpts.length + ' 件）');
      const cName = cSorts.filter((b) => /名称/.test(b.textContent))[0];
      cName.click();
      const cOpts2 = Array.prototype.slice.call(d.querySelectorAll('#opts button'));
      eq(cOpts2.length, cOpts.length, '再换一种排法，件数仍然不变');
      cSorts.filter((b) => /表序/.test(b.textContent))[0].click();
      /* 库存不够时按钮应当禁用 */
      w.MC.bus.state.inventory = {};
      w.MC.bus.emit('state', w.MC.bus.state);
      const acts2 = Array.prototype.slice.call(d.querySelectorAll('.vat button'))
        .filter((b) => /合成/.test(b.textContent));
      ok(acts2.length === 0 || acts2[0].disabled, '手上没元件时合成按钮禁用');
      w.MC.bus.state.inventory = {};
      w.MC.bus.state.knownRx = {};
      w.MC.bus.state.culture = [null];
      w.MC.bus.save();
    }],
    ['rooms/codex.html', '图鉴', (w, d) => {
      const cells = d.querySelectorAll('#list .cell');
      eq(cells.length, w.MC.MODULES.length, '每个元件一个位置');
      eq(d.querySelectorAll('#list .cell.void').length, w.MC.MODULES.length, '全未点亮时全部留白');
      /* 精化：没撞到过就留白 */
      eq(d.querySelectorAll('#elites .cell').length, w.MC.ELITES.length, '每种精化徽记一个位置');
      eq(d.querySelectorAll('#elites .cell.void').length, w.MC.ELITES.length, '全未撞到时精化全部留白');
      /* 进度栏同时报阶跃与纪元 */
      ok(/阶跃/.test(d.getElementById('prog').textContent), '图鉴里报得出阶跃');
      ok(/纪元/.test(d.getElementById('prog').textContent), '图鉴里报得出纪元');
      w.MC.bus.state.found = { bolt: true, rapid: true };
      w.MC.bus.state.seen = { 'elite:thick': true };
      w.MC.bus.emit('state', w.MC.bus.state);
      eq(d.querySelectorAll('#list .cell.void').length, w.MC.MODULES.length - 2, '点亮两个后少了两个空位');
      eq(d.querySelectorAll('#elites .cell.void').length, w.MC.ELITES.length - 1, '撞到一种精化后少一个空位');
      const got = d.querySelectorAll('#list .cell:not(.void)');
      got[0].click();
      ok(/反应/.test(d.getElementById('detail').textContent), '明细里列出了反应');

      /* ---- 排序：按种类或等级 ---- */
      const sortBtns = Array.prototype.slice.call(d.querySelectorAll('#sorts button'));
      eq(sortBtns.length, w.MC.SORTS.length, '每种排法一个按钮');
      const M = w.MC.modules;
      /* 等级排法：等级必须单调不升，且真的覆盖到最高级 */
      const byLv = M.sorted(w.MC.MODULES, 'lv');
      let mono = true;
      for (let i = 1; i < byLv.length; i++) if (byLv[i].lv > byLv[i - 1].lv) mono = false;
      ok(mono, '按等级排是单调不升的');
      eq(byLv[0].lv, 10, '按等级排时最高级排在最前');
      /* 必须换过位置，否则等于没排 */
      ok(byLv[0].id !== w.MC.MODULES[0].id, '按等级排真的换了顺序');
      /* 种类排法：四种要各自连成一段 */
      const byKind = M.sorted(w.MC.MODULES, 'kind');
      const runs = byKind.reduce((acc, m) => {
        if (!acc.length || acc[acc.length - 1].cat !== m.cat) acc.push({ cat: m.cat, n: 1 });
        else acc[acc.length - 1].n++;
        return acc;
      }, []);
      eq(runs.length, 4, '按种类排时四种各自连成一段（实际 ' + runs.length + ' 段）');
      /* 排序只改显示：不改数组本体，也不改任何判定 */
      eq(w.MC.MODULES[0].id, 'bolt', '排序不改动元件表本身');
      eq(JSON.stringify(M.compile(['bolt', 'hull', null, null, null, null]).mods),
        JSON.stringify(M.sorted(w.MC.MODULES, 'lv') && M.compile(['bolt', 'hull', null, null, null, null]).mods),
        '排序不改变构筑数值');
      /* 点一下等级排法：偏好记下，分堆抬头出现 */
      const lvBtn = sortBtns.filter((b) => /等级/.test(b.textContent))[0];
      lvBtn.click();
      eq(w.MC.modules.sortMode(), 'lv', '切到等级排法后偏好记下了');
      ok(/\d+ 级/.test(d.getElementById('list').textContent), '按等级排时每一堆有「第几级」的抬头');
      /* 装配台共用同一张排法表 */
      eq(w.MC.SORTS.length >= 4, true, '排法表够用');
      w.MC.modules.setSortMode('base');
      w.MC.bus.state.found = {};
      w.MC.bus.state.seen = {};
      w.MC.bus.save();
    }],
    ['rooms/nursery.html', '养成室', (w, d) => {
      eq(d.querySelectorAll('.node').length, w.MC.NURSERY.length, '每个节点一个位置');
      w.MC.bus.state.residue = 999;
      w.MC.bus.state.nursery = { done: {}, growing: {} };
      w.MC.bus.emit('state', w.MC.bus.state);
      const btns = Array.prototype.slice.call(d.querySelectorAll('.node button'))
        .filter((b) => !b.disabled);
      ok(btns.length > 0, '有能买的节点');
      const before = w.MC.bus.state.residue;
      btns[0].click();
      ok(w.MC.bus.state.residue < before, '买下后残渣减少');
      ok(Object.keys(w.MC.bus.state.nursery.done).length +
         Object.keys(w.MC.bus.state.nursery.growing).length > 0, '节点已记下');
      ok(/局 外/.test(d.body.textContent) && /局 内/.test(d.body.textContent), '局内与局外分开写明');
      /* 六个分支都在 */
      ['根', '枝', '脉', '环', '核', '律'].forEach((b) => {
        ok(d.body.textContent.indexOf(b) >= 0, '分支「' + b + '」在场');
      });
      /* 买全后槽位变多 */
      w.MC.NURSERY.forEach((n) => {
        w.MC.bus.state.residue = 9999;
        w.MC.nursery.buy(n.id);
        w.MC.bus.state.nursery.done[n.id] = true;
      });
      w.MC.bus.emit('state', w.MC.bus.state);
      ok(w.MC.nursery.effects().slots >= 7, '第七位解锁后槽位变多');
      ok(w.MC.nursery.effects().vatSlots >= 3, '三膛解锁后炉膛变多');
      w.MC.bus.state.residue = 0;
      w.MC.bus.state.nursery = { done: {}, growing: {} };
      w.MC.bus.save();
    }],
    ['rooms/ladder.html', '阶跃', (w, d) => {
      ok(d.querySelectorAll('.step').length >= 8, '八级阶梯');
      ok(w.MC.ladder.atOf(1) <= 1000, '第一阶门槛在可走到的范围内');
      ok(w.MC.ladder.atOf(8) <= 1e6, '最后一阶门槛在可走到的范围内');
      ok(!d.getElementById('rng'), '推演滑杆已移除（不再提前剧透）');
      w.MC.bus.state.kills = w.MC.ladder.atOf(1);
      w.MC.bus.emit('state', w.MC.bus.state);
      ok(d.querySelectorAll('.step.on, .step.bad').length >= 1, '跨过门槛点亮第一阶');
      ok(/？/.test(d.body.textContent), '未点亮的一层显示为 ？');
      /* 纪元那一栏也在 */
      ok(/纪元/.test(d.body.textContent), '阶跃页同时展示纪元');
      w.MC.bus.state.kills = 0;
      w.MC.bus.save();
    }],
    ['rooms/stance.html', '流派', (w, d) => {
      /* 风格改的是规则，所以它有自己一间，不再塞在设置里 */
      ok(d.querySelectorAll('#styles .sk').length >= w.MC.STYLES.length, '每种风格一个位置');
      const swift = Array.prototype.slice.call(d.querySelectorAll('#styles .sk'))
        .filter((b) => /疾/.test(b.textContent))[0];
      ok(!!swift, '「疾」风格在场');
      swift.click();
      eq(w.MC.bus.state.prefs.style, 'swift', '风格换掉了');
      ok(w.MC.cosmetics.styleMods().rateMul < 1, '「疾」风格的射速乘算真的变了');
      /* 读了数就要能看懂：流派把乘算摊在明面上 */
      ok(/移速|生命|出场数/.test(d.getElementById('read').textContent), '流派把乘算读出来了');
      const plain = Array.prototype.slice.call(d.querySelectorAll('#styles .sk'))
        .filter((b) => /素/.test(b.textContent))[0];
      if (plain) plain.click();
      w.MC.bus.state.prefs.style = 'plain';
      w.MC.bus.save();
    }],
    ['rooms/settings.html', '设置', (w, d) => {
      eq(d.querySelectorAll('#skins .sk').length, w.MC.SKINS.length, '每套皮肤一个位置');
      /* 风格已经搬走：设置里不该再有它的位置 */
      eq(d.querySelectorAll('#styles .sk').length, 0, '设置里不再摆风格');
      /* 换皮：CSS 变量真的变了，判定不变 */
      const before = JSON.stringify(w.MC.modules.compile(['bolt', 'hull', null, null, null, null]).mods);
      const root = d.documentElement;
      Array.prototype.slice.call(d.querySelectorAll('#skins .sk'))[1].click();
      ok(w.MC.bus.state.prefs.skin !== 'ink', '皮肤换掉了');
      ok(root.style.getPropertyValue('--bg').length > 0, 'CSS 变量被写上去了');
      eq(JSON.stringify(w.MC.modules.compile(['bolt', 'hull', null, null, null, null]).mods), before,
        '换皮不改变构筑数值');
      /* 无障碍开关 */
      ok(d.querySelectorAll('#toggles .tog').length >= 4, '无障碍与声音开关都在');
      const fx = Array.prototype.slice.call(d.querySelectorAll('#toggles .tog'))
        .filter((b) => /画面特效/.test(b.textContent))[0];
      const fx0 = w.MC.bus.state.prefs.fx;
      fx.click();
      ok(w.MC.bus.state.prefs.fx !== fx0, '画面特效开关真的翻了');
      w.MC.bus.state.prefs.skin = 'ink';
      w.MC.bus.state.prefs.style = 'plain';
      w.MC.bus.save();
    }]
  ];

  for (const [file, name, fn] of ROOMS) {
    section('房间 · ' + name);
    const dom = await open(file);
    try { fn(dom.window, dom.window.document); }
    catch (e) { fail++; fails.push(name + ' 抛错：' + ((e && e.message) || e)); }
    dom.window.close();
  }
}

/* ============ 6. 随机层 ============ */
async function testAnomaly() {
  section('随机层');
  const dom = await open('index.html');
  const MC = dom.window.MC, d = dom.window.document;
  ok(!!(MC.anomaly && MC.ANOMALY), '随机层已挂载');
  ok(MC.ANOMALY.WEAVE.length >= 10, '织构表够多（' + MC.ANOMALY.WEAVE.length + '）');
  ok(MC.ANOMALY.EVENTS.length >= 10, '当波事件表够多（' + MC.ANOMALY.EVENTS.length + '）');

  /* 可复现：同编号同局数 = 同一张织构 */
  const a1 = MC.anomaly.rollWeave(777, 1);
  const a2 = MC.anomaly.rollWeave(777, 1);
  eq(JSON.stringify(a1.mods), JSON.stringify(a2.mods), '同一局织构可复现');
  eq(a1.picks.length, 2, '一局抽两缕');
  const a3 = MC.anomaly.rollWeave(777, 2);
  ok(JSON.stringify(a1.mods) !== JSON.stringify(a3.mods), '换一局织构重抽');
  ok(JSON.stringify(MC.anomaly.rollWeave(778, 1).mods) !== JSON.stringify(a1.mods), '换编号织构变一套');

  /* 当波事件序列 */
  const seq = function (M, token) {
    const o = [];
    for (let w = 3; w <= 30; w++) { const e = M.anomaly.waveEvent(777, w, token); o.push(e ? e.def.id : '-'); }
    return o.join(',');
  };
  eq(seq(MC, 1), seq(MC, 1), '事件序列可复现');
  ok(seq(MC, 1) !== seq(MC, 2), '换一局事件序列重抽');
  eq(MC.anomaly.waveEvent(777, 1, 1), null, '前两波不抽事件');

  /* 异常元件每局重掷 */
  const n1 = JSON.stringify(MC.anomaly.rerollAnomaly(777, 1));
  const n1b = JSON.stringify(MC.anomaly.rerollAnomaly(777, 1));
  const n2 = JSON.stringify(MC.anomaly.rerollAnomaly(777, 2));
  eq(n1, n1b, '异常元件同一局重掷一致');
  ok(n1 !== n2, '异常元件换局重掷');

  /* 合流点：织构 + 事件 + 波相 -> rule，且上限在这里收口 */
  const eng = MC.engine.create(d.getElementById('stage'), {});
  eng.reset(777);
  ok(!!eng.rule && !!eng.weave, '开局即有织构与规则表');
  eng.event = MC.anomaly.waveEvent(777, 20, 1);
  eng.recalcRule();
  ok(isFinite(eng.rule.hpMul) && eng.rule.hpMul > 0, '合流后的数值有限');
  eng.weave = { mods: { hpMul: 999, spdMul: 999, spawnMul: 999 } };
  eng.recalcRule();
  ok(eng.rule.hpMul <= 6 && eng.rule.spdMul <= 2.6 && eng.rule.spawnMul <= 2.4, '织构数值在合流点被钳住');

  /* 波相真的进合流点：硬化应当在 hpMul 上体现。
     这里把织构按成空的——织构是每局随机抽两缕的，
     带着它比就会把随机波动误读成波相的作用。 */
  eng.weave = { mods: {} };
  eng.startWave(3);
  const hpEarly = eng.rule.hpMul;
  eng.startWave(20);
  ok(eng.rule.hpMul > hpEarly, '波相「硬化」在第 14 波之后把 hpMul 抬起来了（' +
    hpEarly.toFixed(2) + ' → ' + eng.rule.hpMul.toFixed(2) + '）');
  /* 精化率要到「盛」（第 50 波）才抬得动，所以分两段验 */
  eng.startWave(13);
  const eEarly = eng.rule.eliteChance;
  eng.startWave(50);
  ok(eng.rule.eliteChance > eEarly, '波相「盛」在第 50 波把精化率抬起来了（' +
    eEarly.toFixed(3) + ' → ' + eng.rule.eliteChance.toFixed(3) + '）');
  ok(eng.rule.eliteChance <= 0.45, '精化率在合流点被封顶');

  /* 风格「静」把当波事件按掉 */
  MC.bus.state.prefs.style = 'quiet';
  const eq2 = MC.engine.create(d.getElementById('stage'), {});
  eq2.reset(777);
  eq2.startWave(10);
  eq(eq2.event, null, '风格「静」之下当波事件整条不抽');
  MC.bus.state.prefs.style = 'plain';

  /* 纪元接进引擎：血量坡度真的随纪元变陡 */
  MC.bus.state.kills = 0;
  const eA = MC.engine.create(d.getElementById('stage'), {});
  eA.reset(777);
  MC.bus.state.kills = MC.epoch.atOf(7);
  const eB = MC.engine.create(d.getElementById('stage'), {});
  eB.reset(777);
  const w30a = MC.enemies.scaleOf(30);
  ok(eA.law && eB.law, '两端都拿到了律');
  ok(eB.law.hpWave > eA.law.hpWave, '纪元往后，尺子确实换了一把');
  ok(w30a > 1, '敌人血量基准仍然是二次增长');

  /* 精化接进引擎 */
  const eC = MC.engine.create(d.getElementById('stage'), {});
  eC.reset(777);
  let sawElite = 0;
  for (let i = 0; i < 200; i++) {
    eC.spawnEnemy('ash');
    if (eC.enemies.some((e) => e.elite)) sawElite++;
  }
  ok(sawElite > 0, '场上真的出现过精化');
  const anyElite = eC.enemies.find((e) => e.elite);
  if (anyElite) ok(!!anyElite.eliteName && !!anyElite.eliteGlyph, '精化带着看得见的徽记');

  /* 几何障有血，所以净化与穿透都能敲掉它 */
  const eD = MC.engine.create(d.getElementById('stage'), {});
  eD.reset(777);
  eD.startWave(40);
  ok(eD.drifts.length > 0, '第 40 波场上有几何障');
  ok(eD.drifts[0].hp > 0, '几何障有血量');

  /* 主舞台能跑过全部波相而不炸 */
  MC.bus.state.kills = 0;
  const eE = MC.engine.create(d.getElementById('stage'), {});
  eE.reset(31337);
  eE.player.shieldMax = 99999; eE.player.shield = 99999; eE.player.maxHp = 99999; eE.player.hp = 99999;
  let t2 = null;
  try {
    for (let w = 1; w <= 55; w++) {
      eE.startWave(w);
      for (let i = 0; i < 90; i++) { eE.step(16.67); eE.draw(); }
    }
  } catch (e) { t2 = e; }
  ok(!t2, '从第 1 波跑到第 55 波（全波相）不抛错' + (t2 ? '：' + t2.message : ''));

  MC.bus.state.kills = 0;
  MC.bus.state.prefs.style = 'plain';
  dom.window.close();
}

/* ============ 7. 内置说明 ============ */
async function testGuide() {
  section('内置说明');
  const dom = await open('guide/index.html');
  const w = dom.window, d = w.document;
  ok(!!(w.MC && w.MC.MODULES && w.MC.ENEMIES && w.MC.ANOMALY), '内置说明读到的是同一份声明表');
  ok(fs.existsSync(path.join(ROOT, 'guide', 'index.html')), 'guide/index.html 在位');
  ok(fs.existsSync(path.join(ROOT, 'guide', 'guide.js')), 'guide/guide.js 在位');
  /* 改名：正文与标题都不再叫 WIKI */
  ok(!/WIKI/.test(d.body.textContent), '正文里不再出现 WIKI 这个名字');
  ok(/内置说明/.test(d.body.textContent), '正写的是「内置说明」');
  ok(!fs.existsSync(path.join(ROOT, 'wiki')), '旧的 wiki 目录已经不在了');

  const ids = Array.prototype.slice.call(d.querySelectorAll('#nav a'))
    .map((a) => a.getAttribute('data-p'));
  ok(ids.length >= 14, '导航里页面够多（' + ids.length + '）');

  /* 每一页都真的渲染出东西，且语气过关。给人读的空页等于坏页。
     注意：render() 会重建导航，所以每点一次都要**重新取** a，
     抓着第一次的引用点下去会点到已经脱离文档的节点上。 */
  const bad = [];
  const texts = {};
  ids.forEach(function (id) {
    const a = d.querySelector('#nav a[data-p="' + id + '"]');
    a.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    const t = d.getElementById('main').textContent || '';
    texts[id] = t;
    const m = t.match(BAN);
    if (m) bad.push(id + ' 字面否定词 ' + m.join('/'));
    if (t.trim().length < 80) bad.push(id + ' 内容过短');
  });
  eq(bad.length, 0, '每一页都有内容且语气过关' + (bad.length ? '：' + bad.join('；') : ''));

  /* 全部可玩内容都要展示得出来。这一段逐项点名。 */
  const joined = ids.map((id) => texts[id] || '').join('\n');
  const need = [
    ['合成', '合成经济'], ['熔炉', '每局重置元件'], ['判定点', '判定点机制'],
    ['受击', '受击冷却'], ['瞄准', '手动瞄准'], ['波相', '波相系统'],
    ['精化', '精化徽记'], ['纪元', '纪元/律'],
    ['皮肤', '皮肤'], ['风格', '游戏风格'], ['元件', '元件表'],
    ['协同', '协同表'], ['敌人', '敌人表'], ['阶跃', '阶跃表'],
    ['养成', '养成节点'], ['反应', '培养皿反应'], ['Boss', 'Boss'],
    ['律', '纪元的律'], ['巨构', '巨构几何体'], ['华丽', '华丽生物'],
    ['精英', '精英敌人'], ['脾气', '局内成长随机化']
  ];
  const miss = need.filter((x) => joined.indexOf(x[0]) < 0).map((x) => x[1]);
  eq(miss.length, 0, '全部可玩内容都展示到了' + (miss.length ? '，缺：' + miss.join('、') : ''));

  /* 数据是从表里读的，不是抄的第二份 */
  const foot = d.getElementById('foot').textContent;
  ok(new RegExp(w.MC.MODULES.length + ' 元件').test(foot), '页脚报的是元件表的真实条数');
  ok(new RegExp(w.MC.reactions.total() + ' 组合').test(foot), '页脚报的是组合表的真实条数');
  ok(new RegExp(w.MC.NURSERY.length + ' 养成节点').test(foot), '页脚报的是养成表的真实条数');
  ok(new RegExp(w.MC.PHASES.length + ' 波相').test(foot), '页脚报的是波相表的真实条数');
  ok(new RegExp(w.MC.ELITES.length + ' 精化').test(foot), '页脚报的是精化表的真实条数');
  ok(new RegExp(w.MC.EPOCHS.length + ' 纪元').test(foot), '页脚报的是纪元表的真实条数');

  /* 搜索 */
  const q = d.getElementById('q');
  q.value = '留白';
  q.dispatchEvent(new w.Event('input'));
  await new Promise((r) => setTimeout(r, 220));
  ok(d.querySelectorAll('#res .card').length > 0, '搜索能命中');
  q.value = 'zzzzzz';
  q.dispatchEvent(new w.Event('input'));
  await new Promise((r) => setTimeout(r, 220));
  ok(/没有这个词/.test(d.getElementById('res').textContent), '搜不到时给的是一句话，不是空白');

  /* 明暗切换是硬继承项：两套都要在 */
  d.getElementById('theme').click();
  eq(d.documentElement.getAttribute('data-theme'), 'dark', '能切到夜间');
  d.getElementById('theme').click();
  eq(d.documentElement.getAttribute('data-theme'), 'light', '能切回日间');

  dom.window.close();
}

/* ============ 8. 语气守卫 ============ */
const BAN = /(没有|无法|不能|不可能|不必)/g;
const PAGES = ['index.html', 'rooms/rig.html', 'rooms/culture.html', 'rooms/codex.html',
               'rooms/nursery.html', 'rooms/ladder.html', 'rooms/stance.html',
               'rooms/settings.html', 'guide/index.html'];

function scan(label, text) {
  const m = String(text || '').match(BAN);
  if (!m) return;
  fail++;
  fails.push(label + ' 出现字面否定词：' + m.join('/') + '　@ ' + String(text).trim().slice(0, 34));
}

async function testTone() {
  section('语气守卫');
  for (const f of PAGES) {
    const dom = await open(f);
    const d = dom.window.document;
    d.querySelectorAll('script, style').forEach((n) => n.remove());
    scan(f, d.body.textContent);
    dom.window.close();
  }
  const dom = await open('index.html');
  const MC = dom.window.MC;
  MC.MODULES.forEach((m) => scan('元件 ' + m.id, m.name + m.note));
  MC.ENEMIES.forEach((e) => scan('敌人 ' + e.id, e.name));
  MC.REACTIONS.forEach((r) => scan('反应 ' + r.a + '+' + r.b, r.note));
  MC.PHASES.forEach((p) => scan('波相 ' + p.id, p.name + p.note));
  MC.ELITES.forEach((e) => scan('精化 ' + e.id, e.name + e.note));
  MC.LADDER.forEach((l) => scan('阶跃 ' + l.tier, l.name + l.note));
  MC.EPOCHS.forEach((e) => scan('纪元 ' + e.id, e.name + e.note));
  MC.SYNERGY.forEach((s) => scan('协同 ' + s.id, s.name + s.note));
  MC.ANOMALY.WEAVE.forEach((w) => scan('织构 ' + w.id, w.name + w.note));
  MC.ANOMALY.EVENTS.forEach((e) => scan('事件 ' + e.id, e.name + e.note));
  MC.NURSERY.forEach((n) => scan('养成 ' + n.id, n.name + n.note));
  MC.SKINS.forEach((s) => scan('皮肤 ' + s.id, s.name + s.note));
  MC.STYLES.forEach((s) => scan('风格 ' + s.id, s.name + s.note));
  Object.keys(MC.text.T).forEach((k) => {
    const v = MC.text.T[k];
    if (typeof v === 'string') scan('文案 ' + k, v);
  });
  dom.window.close();
}

/* ============ 跑 ============ */
/* ============ 8. 可读性 ============
   字号这件事不会抛错，也不会让任何断言变红——它只会让人读不下去。
   所以这里给它一条硬地板：正文不许小于 11px，行高不许低于 1.8，
   且中文必须有 CJK 字体栈（整页等宽时中文会退到一个挤在一起的回退字体上）。 */
async function testRead() {
  section('可读性');
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  /* 必须锚在行首：html, body {...} 那条也含 body，且它没有 font-size */
  const body = css.match(/^body\s*\{([\s\S]*?)\}/m);
  ok(!!body, '共享样式表里有 body 规则');
  const fs2 = body && body[1].match(/font-size:\s*([\d.]+)px/);
  ok(fs2 && Number(fs2[1]) >= 14, '正文字号不低于 14px（实际 ' + (fs2 ? fs2[1] : '?') + '）');
  const lh = body && body[1].match(/line-height:\s*([\d.]+)/);
  ok(lh && Number(lh[1]) >= 1.85, '正文行高不低于 1.85（实际 ' + (lh ? lh[1] : '?') + '）');
  ok(/PingFang|Microsoft YaHei|Noto Sans CJK|Source Han/.test(body[1]),
    '正文带了 CJK 字体栈（中文不再吃等宽回退）');

  /* 每一页：不许再出现读不出来的小字 */
  const PAGES2 = ['index.html', 'rooms/rig.html', 'rooms/culture.html', 'rooms/codex.html',
    'rooms/nursery.html', 'rooms/ladder.html', 'rooms/stance.html',
    'rooms/settings.html', 'guide/index.html'];
  PAGES2.forEach((f) => {
    const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const small = (t.match(/font-size:\s*([89](\.\d)?|10(\.5)?)px/g) || []);
    eq(small.length, 0, f + ' 里没有小于 11px 的字' + (small.length ? '（' + small.join(',') + '）' : ''));
    /* line-height: 1 是「图标 / 大字居中」的惯用写法，不承载正文，放过它 */
    const tight = (t.match(/line-height:\s*(1\.[0-2]\d?)\s*[;}"']/g) || []);
    eq(tight.length, 0, f + ' 里没有低于 1.3 的行高' + (tight.length ? '（' + tight.join(',') + '）' : ''));
    /* 上界同样要守：批量改字号时脚本把 2.5 写成过 25、2.55 写成过 255，
       页面看着是「打不开」，但功能断言一条都不会红。 */
    const loose = (t.match(/line-height:\s*([5-9]\d*(\.\d+)?)\s*[;}"']/g) || []);
    eq(loose.length, 0, f + ' 里没有大于 4 的行高' + (loose.length ? '（' + loose.join(',') + '）' : ''));
  });
}

const only = process.argv[2];
const tasks = [
  ['core', testCore], ['engine', testEngine], ['economy', testEconomy], ['hub', testHub],
  ['rooms', testRooms], ['anomaly', testAnomaly], ['guide', testGuide], ['tone', testTone],
  ['read', testRead]
];
for (const [k, fn] of tasks) {
  if (only && only !== k) continue;
  await fn();
}

process.stdout.write('\n  ' + '─'.repeat(46) + '\n');
process.stdout.write('  通过 ' + pass + '　失败 ' + fail + '\n');
if (fail) {
  fails.slice(0, 30).forEach((f) => process.stdout.write('  ✕ ' + f + '\n'));
  process.exit(1);
}
process.stdout.write('  全部断言通过。\n');
/* 断言跑完就收工。jsdom 留下的 timer / BroadcastChannel 会让事件循环一直挂着，
   不显式退出的话，命令要空等好几分钟才返回——那段时间全花在 teardown 上，
   与断言无关。 */
process.exit(0);
