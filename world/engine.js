/* ==========================================================================
   world/engine.js —— 主舞台引擎（Canvas 2D，无框架）
   --------------------------------------------------------------------------
   三条约定，改动前先读：
     1. 玩家只负责走位，开火是自动的。系统自己跑，玩家负责改系统——这是本作的核心。
     2. 一切随时间推进的量吃 dt，dt 以 60fps 为 1。渲染与判定用同一份数据。
     3. 难度靠「叠规则」不靠「调数字」：每 5 波一条变异，击杀每跨一个数量级一条阶跃。

   局内与局外的分界：reset() 只清局内（波次 / 本局击杀 / 蓄能 / 变异进度）。
   库存、装配、养成、残渣一律不动——要清那些走 MC.bus.wipeMeta()。

   禁忌：周期闪烁、全屏反相、突然强光。受击只做一次短闪。
   ========================================================================== */
window.MC = window.MC || {};
(function (MC) {
  'use strict';

  var W = 1120, H = 620;
  var STEP = 1000 / 60;

  /* 受击冷却：整整一秒。一秒之内所有伤害都进不来。
     这一条是硬继承项——它不是为了削弱，是为了杜绝「一帧被打死十次」那种
     读不出因果的死亡。冷却期间只做短闪，不做周期闪烁。 */
  var HURT_CD = 60;

  /* 场上物件上限：清不完的时候最老的先走 */
  var CAP_ORB = 90, CAP_EMBER = 70, CAP_ZONE = 40, CAP_BEAM = 12, CAP_DUST = 90;

  /* 判定点半径。角色的**视觉**体积由 p.r 决定，**受击**只看中心这个点。
     所以「收束 / 虚身」减的不再是可见大小，而是真的更难被打中——
     看得见的那部分还是那么大，中间的判定点在小。 */
  var HIT_R = 4.5;

  /* ---- 蓄能 ----
     它有三条来路，数值只写在这里，逻辑里不再出现裸数字：
       kill  每击杀一只
       dmg   每造成一点伤害（打不死的东西也在攒，所以堆伤害的构筑一样能放净化）
       ember 走过去收掉一撮余烬
     旧版只靠余烬充能，而所有 addEmber 调用都传了 mild=1，
     收余烬那一行的 !em.mild 于是恒为假——蓄能永远停在 0，净化一次也没放过。
     「蓄能没有效果」的根因就在这一处，不是净化本身没写。 */
  var CHARGE = { kill: 2.4, dmg: 0.010, ember: 4 };

  /* 净化 / 清波的回血比例。回血来路太少，这两条是新增的两条主渠。 */
  var HEAL = { purge: 0.12, waveClear: 0.07, ember: 1.6 };

  /* 敌人形状：边数与内构。它长什么样，由它是哪一种决定。 */
  var SIDES = {
    chase: 3, weave: 4, lurk: 4, bomb: 5, emit: 8, devour: 7, scatter: 5,
    kink: 3, mirror: 4, draw: 6, slip: 3, spore: 6, sweep: 4, dome: 6,
    rot: 5, coast: 3, weft: 6, ape: 4, fall: 5, chord: 8, gate: 6, sink: 6, crown: 6,
    /* 巨构：边数多、形状稳。它是几何体，所以它看起来就该是几何体。 */
    bulwark: 4, spire: 3, plinth: 8, axis: 6, horizon: 4,
    /* 华丽：边数偏多，内构最花 */
    plume: 5, fan: 7, ribbon: 3, bead: 8, iris: 6,
    /* 精英：形状收得住，靠外圈那条徽记认 */
    vanguard: 3, champion: 6, warden: 5, herald: 4, overlord: 8
  };
  var DETAIL = {
    chase: 'core', weave: 'ring', lurk: 'cross', bomb: 'dot', emit: 'ring',
    devour: 'tri', scatter: 'bar', kink: 'core', mirror: 'cross', draw: 'ring',
    slip: 'core', spore: 'dot', sweep: 'bar', dome: 'ring', rot: 'tri',
    coast: 'core', weft: 'cross', ape: 'cross', fall: 'dot', chord: 'ring',
    gate: 'ring', sink: 'tri', crown: 'bar',
    bulwark: 'bar', spire: 'cross', plinth: 'ring', axis: 'tri', horizon: 'bar',
    plume: 'dot', fan: 'ring', ribbon: 'core', bead: 'dot', iris: 'ring',
    vanguard: 'tri', champion: 'cross', warden: 'ring', herald: 'bar', overlord: 'tri'
  };

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
  function hsl(h, s, l, a) { return 'hsla(' + h + ',' + s + '%,' + l + '%,' + a + ')'; }

  /* ---- 空间网格：子弹与敌人的宽相位。别让 300×170 变成每帧五万次比较 ---- */
  function Grid() { this.cell = 72; this.map = {}; }
  Grid.prototype.key = function (cx, cy) { return cx + ',' + cy; };
  Grid.prototype.build = function (list) {
    this.map = {};
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      var cx = Math.floor(e.x / this.cell), cy = Math.floor(e.y / this.cell);
      var k = this.key(cx, cy);
      (this.map[k] || (this.map[k] = [])).push(e);
    }
  };
  Grid.prototype.near = function (x, y, out) {
    out.length = 0;
    var cx = Math.floor(x / this.cell), cy = Math.floor(y / this.cell);
    for (var dx = -1; dx <= 1; dx++) {
      for (var dy = -1; dy <= 1; dy++) {
        var a = this.map[this.key(cx + dx, cy + dy)];
        if (a) for (var i = 0; i < a.length; i++) out.push(a[i]);
      }
    }
    return out;
  };

  function Engine(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = opts || {};
    this.W = W; this.H = H;

    this.running = false; this.paused = false; this.over = false;
    this.wave = 0; this.kills = 0; this.runKills = 0;
    this.waveGap = 0; this.spawnQ = []; this.spawnT = 0;
    this.time = 0; this.shake = 0; this.hurt = 0;
    this.charge = 0; this.revived = false; this.purges = 0;
    /* 这几个在 reset 之前就会被读到（漂移墙判伤读 invuln、波次读 waveLeft），
       留在构造函数里给零值，省得 undefined 参与比较时静默走错分支。 */
    this.invuln = 0; this.slowed = 0; this.stillT = 0;
    this.waveLeft = 0; this.waveLen = 1; this.fireTick = 0;
    this.hpWave = 1;
    /* 这一局的成长脾气。constructor 里先给一份零号，免得 reset 之前被读到。 */
    this.growth = (MC.enemies && MC.enemies.runGrowth) ? MC.enemies.runGrowth(0, 0) : null;
    this.runToken = 0; this.elapsed = 0; this.spawnedThisWave = 0;

    /* r 是**视觉**半径，hitR 是**判定**半径。两者分开，画与判不再共用一个数。 */
    this.player = { x: W / 2, y: H / 2, r: 14, hitR: HIT_R, hp: 100, maxHp: 100, shield: 0, shieldMax: 0, hx: 1, hy: 0 };
    this.enemies = []; this.bullets = []; this.ebullets = [];
    this.orbs = []; this.embers = []; this.drifts = [];
    this.zones = []; this.beams = []; this.dust = [];
    this.boss = null; this.orbiters = []; this.clones = [];
    this.mods = null; this.flags = {};

    this.keys = {};
    /* 鼠标初始指在角色的正上方——那是敌人进场最多的方向。
       进过画布之后 mouse.inside 转 true，准星才画出来。 */
    this.mouse = { x: W / 2, y: H / 2 - 220, inside: false };
    this.seed = 0;
    this._raf = 0; this._last = 0;
    this._grid = new Grid();
    this._near = []; this._near2 = [];
    this._idc = 1;
    /* 三条互不污染的随机流：判定 / 视觉 / AI 回调。
       判定流每局重播一次种，所以同编号 = 同一局。视觉流单独走，
       暂停时只 draw 不 step 也不会把判定流带偏。 */
    this.rrng = MC.seed.mulberry32(1);
    this._vrng = MC.seed.mulberry32(2);
    this._ai = null;

    this.resize();
    this.bind();
    this.seedDust();
  }

  Engine.prototype.resize = function () {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = W * dpr;
    this.canvas.height = H * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  Engine.prototype.seedDust = function () {
    var rng = MC.seed.rngFrom(this.seed || 1, 'dust');
    this.dust.length = 0;
    for (var i = 0; i < 70; i++) {
      this.dust.push({
        x: rng() * W, y: rng() * H,
        vx: (rng() - 0.5) * 0.22, vy: (rng() - 0.5) * 0.22,
        r: 0.6 + rng() * 1.3, a: 0.05 + rng() * 0.13
      });
    }
  };

  Engine.prototype.bind = function () {
    var self = this;
    this._key = function (e) {
      var k = (e.key || '').length === 1 ? e.key.toLowerCase() : e.key;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].indexOf(e.key) >= 0) e.preventDefault();
      if (e.type === 'keydown') {
        if (!self.keys[k] && k === ' ' && self.mods && self.mods.mods.dash > 0) self.dash();
        self.keys[k] = true;
      } else self.keys[k] = false;
    };
    window.addEventListener('keydown', this._key);
    window.addEventListener('keyup', this._key);

    /* 鼠标只管一件事：指出方向。移动永远只认键盘。
       旧版鼠标能拖着人跑、也能自动瞄准，两套控制会在同一帧里打架，
       表现为「有时候准头自己飘掉」——现在这条歧义从输入端就删掉了。 */
    var move = function (e) {
      var r = self.canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      self.mouse.x = (e.clientX - r.left) / r.width * W;
      self.mouse.y = (e.clientY - r.top) / r.height * H;
      self.mouse.inside = true;
    };
    this.canvas.addEventListener('mousemove', move);
    this.canvas.addEventListener('mousedown', move);
    this.canvas.addEventListener('mouseleave', function () { self.mouse.inside = false; });
    /* 触屏：点哪儿朝哪儿打 */
    this.canvas.addEventListener('touchstart', function (e) {
      if (e.touches && e.touches[0]) move(e.touches[0]);
    }, { passive: true });
    this.canvas.addEventListener('touchmove', function (e) {
      if (e.touches && e.touches[0]) move(e.touches[0]);
    }, { passive: true });
  };

  /* 移动只看键盘。鼠标不参与位移。 */
  Engine.prototype.usingKeys = function () {
    var k = this.keys;
    return !!(k.ArrowUp || k.ArrowDown || k.ArrowLeft || k.ArrowRight || k.w || k.a || k.s || k.d);
  };

  /* 准星方向：鼠标相对玩家的向量。没进过画布就沿用上一次朝向。 */
  Engine.prototype.aimVec = function () {
    var p = this.player;
    var dx = this.mouse.x - p.x, dy = this.mouse.y - p.y;
    var d = Math.hypot(dx, dy);
    if (d < 1) return { x: Math.cos(p.ang || 0), y: Math.sin(p.ang || 0) };
    return { x: dx / d, y: dy / d };
  };

  Engine.prototype.togglePause = function (on) {
    this.paused = (on == null) ? !this.paused : !!on;
    return this.paused;
  };

  /* ---- 一局的开始：只清局内 ---- */
  Engine.prototype.reset = function (seed) {
    this.seed = seed || this.seed;
    this.over = false;
    this.wave = 0;
    this.runKills = 0;
    this.revived = false;
    this.purges = 0;
    this.waveGap = 90;
    this.spawnQ = []; this.spawnT = 0; this.waveLeft = 0; this.waveLen = 1;
    this.enemies.length = 0; this.bullets.length = 0; this.ebullets.length = 0;
    this.orbs.length = 0; this.embers.length = 0; this.drifts.length = 0;
    this.zones.length = 0; this.beams.length = 0;
    this.boss = null; this.orbiters.length = 0; this.clones.length = 0;
    this.time = 0; this.shake = 0; this.hurt = 0;
    this.flags = {};
    this.applyRig();
    var m = this.mods.mods;
    var nu = MC.nursery.effects();
    this.player.x = W / 2; this.player.y = H / 2;
    this.player.maxHp = m.hp;
    this.player.hp = m.hp;
    this.player.shieldMax = m.shield;
    this.player.shield = m.shield;
    this.player.r = MC.eff.eff('radius', 14 * m.radiusMul);
    /* 判定点独立于视觉体积。养成室的「虚身」把它缩到 60%，躲得开是真的。 */
    this.player.hitR = HIT_R * m.hitMul;
    this.player.ang = -Math.PI / 2;
    this.charge = nu.chargeStart || 0;
    this._purgeQueued = false;
    this.runToken = (this.runToken || 0) + 1;
    this.startedAt = Date.now();
    this.elapsed = 0;
    this.spawnedThisWave = 0;
    this.rrng = MC.seed.rngFrom(this.seed, 'run' + this.runToken);
    this._vrng = MC.seed.rngFrom(this.seed, 'visual' + this.runToken);
    this._ai = null;
    /* 随机性落点之二：这一局的成长脾气。它只改数字怎么长，不改规则。 */
    this.growth = MC.enemies.runGrowth(this.seed, this.runToken);
    this.seedDust();
    /* 随机性落点之一：这一局抽两缕织构；异常元件也在这时候重掷一次 */
    if (MC.anomaly) {
      this.weave = MC.anomaly.rollWeave(this.seed, this.runToken);
      MC.anomaly.rerollAnomaly(this.seed, this.runToken);
    }
    this.event = null;
    this.recalcRule();
  };

  /* 规则是否在当前生效：变异写在 flags 里（永久），当波事件写在 rule 里（一波）。
     引擎只读这一个出口，不分别去翻两张表。 */
  Engine.prototype.on = function (f) {
    return !!this.flags[f] || !!(this.rule && this.rule[f]);
  };

  /* 规则的合流点：织构（整局）叠上当波事件（一波）叠波相（按波次开），
     再叠风格（一组乘算）。引擎只读这一张 table，不分别去翻任何一张源表。 */
  Engine.prototype.recalcRule = function () {
    var r = MC.anomaly.unit();
    if (this.weave) MC.anomaly.merge(r, this.weave.mods);
    if (this.event) MC.anomaly.merge(r, this.event.mods);
    /* 波相：按当前波次开的全在。条数封顶五条，所以这一层永远是可读的。 */
    if (MC.waves && MC.waves.phaseMods) MC.anomaly.merge(r, MC.waves.phaseMods(this.wave));
    /* 风格：一组乘算。quiet 直接把当波事件按掉。 */
    var st = (MC.cosmetics && MC.cosmetics.styleMods) ? MC.cosmetics.styleMods() : null;
    if (st) {
      if (st.quiet) { r.rain = 0; r.silent = 0; r.rot = 0; r.well = 0; r.jam = 0; r.drifts = 0; }
      r.spawnMul *= st.spawnMul;
      r.hpMul *= st.hpMul;
      r.dropMul *= st.dropMul;
      r.eliteChance = Math.min(0.45, r.eliteChance + (st.spawnMul - 1) * 0.10);
    }
    /* 风格「静」时当波事件整条不抽——它写在这里，所以事件表不用知道自己有风格这回事 */
    this.quiet = !!(st && st.quiet);
    /* 上限只写在这里一次，别在各处各压一回 */
    r.hpMul = Math.max(0.3, Math.min(6, r.hpMul));
    r.spdMul = Math.max(0.4, Math.min(2.6, r.spdMul));
    r.spawnMul = Math.max(0.3, Math.min(2.4, r.spawnMul));
    r.dropMul = Math.max(0.2, Math.min(6, r.dropMul));
    r.mirrorChance = Math.max(0, Math.min(0.8, r.mirrorChance));
    r.plateChance = Math.max(0, Math.min(1, r.plateChance));
    r.respawn = Math.max(0, Math.min(0.35, r.respawn));
    r.eliteChance = Math.max(0, Math.min(0.45, r.eliteChance));
    r.bossEvery = Math.max(1, Math.round(r.bossEvery));
    this.rule = r;
    return r;
  };

  /* ---- 构筑：任何时候改，下一帧就生效 ---- */
  Engine.prototype.applyRig = function () {
    var compiled = MC.modules.compile(MC.bus.state.rig);
    var m = compiled.mods;
    var st = MC.bus.state;
    var fx = MC.ladder.effects(st.kills);
    var nu = MC.nursery.effects();
    var law = MC.epoch.laws(st.kills);
    m.pierce += fx.pierceAdd;
    m.dropMul *= fx.dropMul;
    /* 风格：一组乘算，改的是这一局的形状。 */
    var sty = MC.cosmetics ? MC.cosmetics.styleMods() : null;
    if (sty) {
      m.dmg *= sty.dmgMul || 1;
      m.speed *= sty.speedMul;
      m.rateMul *= sty.rateMul;
      m.hp *= sty.hpMul;
      m.sizeMul = (m.sizeMul || 1) * sty.sizeMul;
    }
    /* 纪元的律：只改「数字怎么长」，不改构筑本身。 */
    if (law) {
      m.rateMul *= law.rateWave;
      m.dropMul *= law.dropWave;
    }
    /* 血量坡度：纪元的律与风格「远」共同决定，改的是「血随波次长多快」，
       不是「血有多少」。旧的写法里这一项只躺在表里、UI 也照着显示，
       引擎却从没读过它——「远」风格的主打就是个空转的开关。 */
    var hw = 1;
    if (law && law.hpWave) hw *= law.hpWave;
    if (sty && sty.hpWave) hw *= sty.hpWave;
    this.hpWave = Math.max(0.35, Math.min(2.2, hw));

    /* 养成室的乘算在 compile 里已经并过一遍；这里只收口 eff 与派生量。
       hitMul 由 compile 从元件表的 hitMul 累加并钳制，
       这里只把「虚身」的闪避并进去——所以它不会被等级缩放翻转。 */
    if (nu && nu.dodge) m.hitMul *= 0.86;
    m.hitMul = Math.max(0.35, Math.min(1.6, m.hitMul));
    m.hitR = 4.5 * m.hitMul;
    m.speed = MC.eff.eff('speed', m.speed);
    m.hp = MC.eff.eff('hpMax', m.hp);
    m.dmg = MC.eff.eff('damage', m.dmg);
    m.radius = MC.eff.eff('radius', 14 * m.radiusMul);
    m.rate = MC.eff.effInv('fireRate', Math.round(m.rate * m.rateMul));
    this.mods = compiled;
    this.ladderFx = fx;
    this.law = law;
    this.syncBody();
    return compiled;
  };

  /* ---- 把构筑写回身体 ----
     旧版只有 reset() 写这几项，applyRig() 只重算 mods 就返回了：
     于是局内捡到甲壳、镀层、收束、膨胀，数值表变了，人没变——
     「增加生命值的元件在本局不生效」就是这么来的。
     现在任何时候改构筑，身体立刻跟上：
       · 上限涨了多少，当前血就加多少（捡到甲壳当场变厚，也当场回那一截）
       · 上限掉回去时只钳住当前血，不倒扣
     重开一局仍然走 reset()，那是「全量赋值」，这里是「按差值跟进」。 */
  Engine.prototype.syncBody = function () {
    var m = this.mods.mods;
    var p = this.player;
    if (!this._bodyBase) {
      p.maxHp = m.hp; p.hp = m.hp;
      p.shieldMax = m.shield; p.shield = m.shield;
      this._bodyBase = true;
    } else {
      var dHp = m.hp - p.maxHp;
      p.maxHp = m.hp;
      if (dHp > 0) p.hp = Math.min(p.maxHp, p.hp + dHp);
      else if (p.hp > p.maxHp) p.hp = p.maxHp;
      var dSh = m.shield - p.shieldMax;
      p.shieldMax = m.shield;
      if (dSh > 0) p.shield = Math.min(p.shieldMax, p.shield + dSh);
      else if (p.shield > p.shieldMax) p.shield = p.shieldMax;
    }
    p.r = m.radius;
    p.hitR = m.hitR;
  };

  /* ---- 波次 ---- */
  Engine.prototype.startWave = function (n) {
    this.wave = n;
    this.spawnedThisWave = 0;
    this.flags = {};
    this.recalcRule();
    var R = this.rule;

    /* 随机性落点之一：这一波抽一条事件。抽不到也是一条结果。
       风格「静」把这一层按掉——它写在 waveEvent 之前，所以事件表不用改。 */
    this.event = (MC.anomaly && !this.quiet) ? MC.anomaly.waveEvent(this.seed, n, this.runToken) : null;
    this.recalcRule();
    R = this.rule;

    /* 事件改的是时刻表，不是数量：一起涌上来 / 撒得极稀 / 出得极快 */
    if (this.event && this.event.spawn) this.retime(this.event.spawn);
    /* 织构与波相改的是数量 */
    var want = Math.max(1, Math.round(this.spawnQ0(R, n) * R.spawnMul));
    this.spawnQ = MC.waves.plan(n, this.seed, this.growth);
    if (want > this.spawnQ.length) {
      var extra = MC.waves.plan(n, this.seed + 7, this.growth);
      while (this.spawnQ.length < want && extra.length) {
        this.spawnQ.push(extra[this.spawnQ.length % extra.length]);
      }
    } else if (want < this.spawnQ.length) this.spawnQ.length = want;
    this.spawnT = 0;

    /* 波相「压」把出怪间隔压短 */
    if (R.waveTighten) for (var q = 0; q < this.spawnQ.length; q++) this.spawnQ[q].at *= (1 - R.waveTighten);

    var boss = MC.waves.bossAt(n, R);
    /* 时长：基准 × 纪元的 waveGain。纪元往上走，一波的时间就变长。 */
    var len = 60 * (16 + Math.min(20, n * 0.5));
    if (this.law && this.law.waveGain !== 1) len *= this.law.waveGain;
    this.waveLeft = len;
    this.waveLen = len;
    if (boss) this.spawnBoss(boss, n);
    if (this.opts.onWave) this.opts.onWave(n, null, boss, this.event);
    if (boss) MC.audio.wave();

    /* 波相「障」在场上立几道几何障。它挡弹，也挡你的准头。 */
    this.buildBarriers(n);

    /* 「定例」：每五波必得一件。养成室给了第二件就落两件。 */
    var nu = MC.nursery.effects();
    if (nu.guaranteed && n % 5 === 0) {
      var rng = MC.seed.rngFrom(this.seed, 'give' + n);
      var cnt = nu.guaranteed2 ? 2 : 1;
      for (var c = 0; c < cnt; c++) {
        var m = MC.modules.rollDrop(n, rng, nu.outLvBonus);
        if (m) this.orbs.push({ x: W / 2 + (c - 0.5) * 40, y: H / 2 - 90, mid: m.id, life: 1200, hue: this.hueOf(m) });
      }
    }
  };

  /* 一波出多少的基准。波相与织构只在它之上乘。 */
  Engine.prototype.spawnQ0 = function (R, n) {
    return Math.min(70, 5 + Math.floor(n * 1.9));
  };

  /* 时刻表重排：同一批东西，换个出法就是另一波 */
  Engine.prototype.retime = function (how) {
    var stepAt = how === 'bunch' ? 3 : (how === 'sparse' ? 42 : 5);
    for (var i = 0; i < this.spawnQ.length; i++) this.spawnQ[i].at = i * stepAt;
  };

  /* 几何障：波相「障」开的。挡弹、挡人、也挡你的准头——
     所以它不是纯粹的惩罚，它把「手动瞄准」这件事重新变得有取舍。
     血量走 R.wallHp，纪元与阶跃都能压它。 */
  Engine.prototype.buildBarriers = function (n) {
    this.drifts.length = 0;
    var R = this.rule;
    if (!R.mist) return;
    var rng = MC.seed.rngFrom(this.seed, 'bar' + n);
    var k = 2 + Math.floor(n / 18);
    for (var i = 0; i < k; i++) {
      this.drifts.push({
        x: MC.seed.range(rng, 130, W - 130), y: MC.seed.range(rng, 100, H - 100),
        w: MC.seed.range(rng, 100, 220), h: 15,
        vx: MC.seed.range(rng, -1.0, 1.0), vy: MC.seed.range(rng, -0.8, 0.8),
        rot: MC.seed.range(rng, 0, Math.PI),
        hp: 40 * (R.wallHp || 1), maxHp: 40 * (R.wallHp || 1), flash: 0
      });
    }
  };

  /* 波相「淤」：地上留会烂的斑。它既减速也掉血，所以「站着不动」从此要付钱。 */
  Engine.prototype.seepSilt = function (dt) {
    if (!this.rule.slowZones) return;
    this.siltT = (this.siltT || 0) - dt;
    if (this.siltT > 0) return;
    this.siltT = 46;
    var p = this.player;
    var rng = this.rrng;
    var x = MC.seed.range(rng, 40, W - 40), y = MC.seed.range(rng, 40, H - 40);
    /* 一半贴着玩家落：所以它逼你动，而不是在角落里摆着看 */
    if (this.rrng() < 0.55) { x = clamp(p.x + (this.rrng() - 0.5) * 180, 30, W - 30); y = clamp(p.y + (this.rrng() - 0.5) * 180, 30, H - 30); }
    this.zones.push({ x: x, y: y, r: 30, life: 260, max: 260, dps: 0.9 + this.wave * 0.05, slow: 0.30 });
    while (this.zones.length > CAP_ZONE) this.zones.shift();
  };

  Engine.prototype.spawnBoss = function (b, n) {
    var S = MC.waves.bossScale(n);
    var total = b.hp * S;
    var parts = [];
    for (var i = 0; i < b.parts; i++) {
      parts.push({
        ang: i * (Math.PI * 2 / b.parts),
        hp: total / b.parts, maxHp: total / b.parts,
        r: 17, flash: 0
      });
    }
    this.boss = {
      def: b, x: W / 2, y: 150, r: 36, spin: 0,
      hp: total, maxHp: total,
      parts: parts, flash: 0, phase: 0
    };
  };

  /* 血量坡度的换算：只缩放「增长部分」，基数那一 1 不动。 */
  Engine.prototype.hpWaveFactor = function () {
    var g = MC.enemies.scaleOf(this.wave) - 1;
    if (!(g > 0) || this.hpWave === 1) return 1;
    return (1 + g * this.hpWave) / (1 + g);
  };

  Engine.prototype.spawnEnemy = function (kindId) {
    if (this.enemies.length >= MC.eff.eff('enemyCount', 170)) return;
    var rng = MC.seed.rngFrom(this.seed, 'spawn' + this.wave + this.spawnT);
    var side = Math.floor(rng() * 4);
    var x, y;
    var inset = this.arenaInset();
    if (side === 0) { x = MC.seed.range(rng, inset, W - inset); y = inset; }
    else if (side === 1) { x = W - inset; y = MC.seed.range(rng, inset, H - inset); }
    else if (side === 2) { x = MC.seed.range(rng, inset, W - inset); y = H - inset; }
    else { x = inset; y = MC.seed.range(rng, inset, H - inset); }
    var e = MC.enemies.make(kindId, this.wave, x, y, rng, 1, this.growth);
    /* 血量坡度只乘在「随波次长出来的那一部分」上：
       0.72 于是真的是「长得慢一点」，而不是「血少一点」。 */
    var hwF = this.hpWaveFactor();
    if (hwF !== 1) { e.hp *= hwF; e.maxHp *= hwF; }
    var R = this.rule;
    if (R) {
      if (R.hpMul !== 1) { e.hp *= R.hpMul; e.maxHp *= R.hpMul; }
      if (R.spdMul !== 1) e.spd *= R.spdMul;
      if (R.rMul !== 1) e.r *= R.rMul;
      if (R.plateChance > 0 && this.rrng() < R.plateChance) e.plate = 1;
    }
    /* 精化：挂一个看得见的徽记。看得见 = 可以针对，
       这是它与旧版「看不见的变体」唯一的区别，也是全部的区别。 */
    var nu = MC.nursery.effects();
    var el = MC.waves.rollElite(this.wave, R, this._idc, nu.eliteBonus || 0);
    /* 精英类必带一枚徽记。它叫精英，就得看得出来是精英——
       而 rollElite 的概率封顶 0.45，所以这一类不走概率，直接补一枚。 */
    if (!el && e.cls === 'elite') el = MC.waves.forceElite(this.wave, this._idc);
    if (el) {
      this.applyElite(e, el);
      /* 精化也要点亮图鉴：徽记是看得见的，看见了就该被记下 */
      var st0 = MC.bus.state;
      if (!st0.seen) st0.seen = {};
      if (!st0.seen['elite:' + el.id]) { st0.seen['elite:' + el.id] = true; MC.bus.save(); }
    }
    e.__id = 'e' + (this._idc++);
    this.spawnedThisWave++;
    var st = MC.bus.state;
    if (!st.seen) st.seen = {};
    if (!st.seen[kindId]) { st.seen[kindId] = true; MC.bus.save(); }
    this.enemies.push(e);
    var mir = Math.max(R ? R.mirrorChance : 0, (this.ladderFx && this.ladderFx.mirrorChance) || 0);
    if (mir > 0 && rng() < mir) {
      var m2 = MC.enemies.make(kindId, this.wave, W - x, H - y, rng, 0.7, this.growth);
      m2.mirror = true;
      if (hwF !== 1) { m2.hp *= hwF; m2.maxHp *= hwF; }
      if (R && R.hpMul !== 1) { m2.hp *= R.hpMul; m2.maxHp *= R.hpMul; }
      if (R && R.spdMul !== 1) m2.spd *= R.spdMul;
      m2.__id = 'e' + (this._idc++);
      this.enemies.push(m2);
    }
  };

  /* 精化的七个徽记。每一个都是一句话，玩家看一眼就知道该怎么打。 */
  Engine.prototype.applyElite = function (e, el) {
    e.elite = el.id;
    e.eliteName = el.name;
    e.eliteGlyph = el.glyph;
    switch (el.id) {
      case 'quick':  e.spd *= 1.55; break;
      case 'thick':  e.hp *= 1.9; e.maxHp *= 1.9; e.spd *= 0.8; break;
      case 'large':  e.hp *= 1.6; e.maxHp *= 1.6; e.r *= 1.6; break;
      case 'small':  e.hp *= 0.45; e.maxHp *= 0.45; e.r *= 0.6; e.spd *= 1.4; break;
      case 'shield': e.plate = 1; e.plate = 2; break;
      case 'twin':   e.split = (e.split || 0) + 2; break;
      case 'burn':   e.burn = 1; break;
    }
    return el;
  };

  /* 收边：纪元的「收律」把场地按纪元往下压。
     edge 的中性值是 1：1 = 照常收，>1 = 收得更狠，<=1 视为不收。
     织构里的「蚀」也能开收边——两条来路，最后都落到同一个数上。 */
  Engine.prototype.arenaInset = function () {
    var edge = 0;
    if (this.law && this.law.edge > 1) edge = this.law.edge;
    if (this.rule && this.rule.wane) edge = Math.max(edge, 1.4);
    if (edge <= 0) return 26;
    return Math.min(210, 30 + this.wave * 3 * edge);
  };

  /* ---- 开火 ----
     方向由调用方给。旧版这一层自己去 pickTarget 找最近的敌人，
     那是「有时候准头自己飘掉」的根因：目标在两次开火之间换人，
     而弹丸还在飞。现在方向只从两处来：鼠标，或环轨/分身自己的选敌。 */
  Engine.prototype.fire = function (fromX, fromY, tx, ty, mul) {
    var m = this.mods.mods;
    if (this.bullets.length >= MC.eff.eff('bulletCount', 300)) return;
    var base = Math.atan2(ty - fromY, tx - fromX);
    var n = Math.max(1, Math.round(m.count));
    for (var i = 0; i < n; i++) {
      var a = base + (n > 1 ? (i - (n - 1) / 2) * m.spread : 0);
      var crit = this.rrng() < m.crit;
      this.bullets.push({
        x: fromX, y: fromY, px: fromX, py: fromY,
        vx: Math.cos(a) * m.bulletSpeed, vy: Math.sin(a) * m.bulletSpeed,
        r: 3 + (m.size || 0) + (m.sizeMul ? (m.sizeMul - 1) * 3 : 0),
        dmg: m.dmg * (crit ? 2.5 : 1) * (mul || 1),
        pierce: m.pierce, hit: {},
        homing: m.homing, chain: m.chain, blast: m.blast, split: m.split,
        slow: m.slow, lifesteal: m.lifesteal, crit: crit,
        life: 150, hue: crit ? 52 : 190
      });
    }
    MC.audio.shot();
  };

  Engine.prototype.dash = function () {
    var p = this.player;
    var d = 108;
    p.x = clamp(p.x + p.hx * d, 18, W - 18);
    p.y = clamp(p.y + p.hy * d, 18, H - 18);
  };

  /* ---- 敌人 AI 的回调。AI 只认这几个，不碰引擎内部 ----
     这些闭包只抓 self，不抓局内状态，所以建一次就够——每帧重建是白给的开销。 */
  Engine.prototype.aiCtx = function () {
    if (this._ai) return this._ai;
    var self = this;
    this._ai = {
      player: this.player,
      shoot: function (e, ux, uy, sp, dmg) {
        if (self.on('silent') || self.ebullets.length > 220) return;
        self.ebullets.push({
          x: e.x, y: e.y, vx: ux * sp, vy: uy * sp, r: 4,
          dmg: dmg, life: 300, hue: e.hue
        });
      },
      blast: function (e, radius, dmg) {
        if (self.on('silent')) return;
        self.addEmber(e.x, e.y, radius * 0.5, 60, 1);
        var near = self._grid.near(e.x, e.y, self._near2);
        var zp = self.rule ? (self.rule.zoneHp != null ? self.rule.zoneHp : 1) : 1;
        for (var i = 0; i < near.length; i++) {
          var o = near[i];
          if (o !== e && dist2(e.x, e.y, o.x, o.y) < radius * radius) o.hp -= dmg * 0.4 * zp;
        }
        /* 判定点 */
        var pr = radius * 0.55 + self.player.hitR;
        if (dist2(e.x, e.y, self.player.x, self.player.y) < pr * pr) self.hurtPlayer(dmg);
      },
      zone: function (x, y, r, life, dps, slow) {
        self.zones.push({ x: x, y: y, r: r, life: life, max: life, dps: dps, slow: slow || 0 });
        while (self.zones.length > CAP_ZONE) self.zones.shift();
      },
      minion: function (e, kind, n) {
        if (self.enemies.length >= MC.eff.eff('enemyCount', 170)) return;
        for (var i = 0; i < n; i++) {
          var m = MC.enemies.make(kind, self.wave, e.x + (i - 0.5) * 18, e.y + (i - 0.5) * 18, e.rng, 0.5, self.growth);
          m.__id = 'e' + (self._idc++);
          self.enemies.push(m);
        }
      },
      nearest: function (e, range, smallerOnly) {
        var best = null, bd = range * range;
        for (var i = 0; i < self.enemies.length; i++) {
          var o = self.enemies[i];
          if (o === e || o.dead) continue;
          if (smallerOnly && o.maxHp >= e.maxHp) continue;
          var d = dist2(e.x, e.y, o.x, o.y);
          if (d < bd) { bd = d; best = o; }
        }
        return best;
      },
      warp: function (e, range) {
        var a = e.rng() * Math.PI * 2;
        e.x = clamp(e.x + Math.cos(a) * range * 0.6, 24, W - 24);
        e.y = clamp(e.y + Math.sin(a) * range * 0.6, 24, H - 24);
        self.addEmber(e.x, e.y, 22, 18, 1);
      },
      beam: function (e, ux, uy, len, dmg) {
        if (self.on('silent')) return;
        self.beams.push({ x: e.x, y: e.y, ux: ux, uy: uy, len: len, life: 14, max: 14, dmg: dmg, hue: e.hue });
        while (self.beams.length > CAP_BEAM) self.beams.shift();
        /* 沿线判定：点到直线的距离，收在判定点上 */
        var p = self.player;
        var rx = p.x - e.x, ry = p.y - e.y;
        var t = clamp(rx * ux + ry * uy, 0, len);
        var br = 7 + p.hitR;
        if (dist2(e.x + ux * t, e.y + uy * t, p.x, p.y) < br * br) self.hurtPlayer(dmg);
      }
    };
    return this._ai;
  };

  /* 受击：一秒冷却。
     冷却期间所有伤害都进不来——不管是接触、弹丸、区域还是光束。
     「虚身」把它再缩一点：判定点变小 + 闪避率，
     两者叠起来才是真正的「小」，不是把画也画小。 */
  Engine.prototype.hurtPlayer = function (dmg) {
    var p = this.player;
    if (this.invuln > 0 || this.over) return false;
    /* 闪避走判定流，所以它可复现：同一局同一次受击，闪与不闪是定的 */
    var dg = this.dodgeRate();
    if (dg > 0 && this.rrng() < dg) {
      this.dodgeFlash = 1;
      return false;
    }
    if (p.shield > 0) {
      var s = Math.min(p.shield, dmg);
      p.shield -= s; dmg -= s;
    }
    if (dmg > 0) p.hp -= dmg;
    this.invuln = HURT_CD;
    this.hurt = 1;
    if (!MC.eff.calm() && this.prefs().fx) this.shake = 0.7;
    MC.audio.hurt();
    if (p.hp <= 0) this.die();
    return true;
  };

  Engine.prototype.prefs = function () {
    var p = MC.bus.state.prefs;
    return p || { fx: 1 };
  };

  /* 闪避率：来自养成室的「虚身」，走判定流所以可复现。 */
  Engine.prototype.dodgeRate = function () {
    var nu = MC.nursery.effects();
    return nu.dodge || 0;
  };

  Engine.prototype.die = function () {
    if (this.over) return;
    var nu = MC.nursery.effects();
    var maxRev = nu.reviveMax || (nu.revive ? 1 : 0);
    if (this.revives < maxRev) {
      this.revives++;
      this.revived = true;
      this.player.hp = this.player.maxHp * 0.55;
      this.invuln = HURT_CD * 2;
      var p = this.player;
      for (var i = this.enemies.length - 1; i >= 0; i--) {
        var e = this.enemies[i];
        if (dist2(e.x, e.y, p.x, p.y) < 220 * 220) { e.dead = true; this.onEnemyDead(e); this.enemies.splice(i, 1); }
      }
      this.addEmber(p.x, p.y, 200, 26, 1);
      MC.bus.toast('再起 · 第 ' + this.revives + ' 次站起来');
      return;
    }
    this.over = true;
    this.player.hp = 0;
    MC.audio.dead();
    if (this.opts.onDead) this.opts.onDead({ wave: this.wave, kills: this.runKills, ms: this.elapsed });
  };

  /* ---- 每帧 ---- */
  Engine.prototype.step = function (dtms) {
    if (this.over) return;
    if (this.paused) { this.time += 0.0001; return; }
    var dt = dtms / STEP;
    if (dt > 3) dt = 3;
    this.time += dt;
    this.elapsed += dtms;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.hurt > 0) this.hurt -= dt / 24;
    if (this.dodgeFlash > 0) this.dodgeFlash -= dt / 8;
    if (this.shake > 0) this.shake -= dt / 26;

    var m = this.mods.mods;
    var p = this.player;
    var fx = this.ladderFx || { decay: 0, respawnChance: 0 };
    var R = this.rule || {};
    /* 养成室加成按帧缓存：充能是每次命中都走一遍的，
       每颗子弹都重算 NODES 会白白吃掉一帧里的大头 */
    this._nu = MC.nursery.effects();

    /* ---- 位移：只认键盘。鼠标不再拖人。 ---- */
    var vx = 0, vy = 0, moved = 0;
    var K = this.keys;
    vx = (K.ArrowRight || K.d ? 1 : 0) - (K.ArrowLeft || K.a ? 1 : 0);
    vy = (K.ArrowDown || K.s ? 1 : 0) - (K.ArrowUp || K.w ? 1 : 0);
    var mm = Math.hypot(vx, vy);
    if (mm > 0) { vx /= mm; vy /= mm; moved = 1; }
    if (vx || vy) { p.hx = vx; p.hy = vy; }
    /* 朝向：始终朝准星。没进过画布就朝最后一次移动的方向。 */
    var av = this.aimVec();
    p.ang = Math.atan2(av.y, av.x);

    /* 收边：重力性质的推力（织构「蚀」与纪元「收律」共用一个 arenaInset） */
    var inset = this.arenaInset();

    /* 波相「淤」：地上留东西。踩着会慢，也会一直掉血。 */
    this.seepSilt(dt);

    /* 「引」：把玩家往它那边拽 */
    var wi;
    for (wi = 0; wi < this.enemies.length; wi++) {
      var pe = this.enemies[wi];
      if (!pe.pull) continue;
      var pdx = pe.x - p.x, pdy = pe.y - p.y;
      var pd = Math.hypot(pdx, pdy) || 1;
      if (pd < 460) { var kp = pe.pull * (1 - pd / 460); vx += pdx / pd * kp; vy += pdy / pd * kp; }
    }

    /* 网 / 斑的减速吃上一帧的结果：判定在移动之后，效果落在下一帧 */
    var spd = m.speed * (this.slowed ? (1 - this.slowed) : 1);
    p.x += vx * spd * dt;
    p.y += vy * spd * dt;

    p.x = clamp(p.x, inset, W - inset);
    p.y = clamp(p.y, inset, H - inset);

    /* 再生 / 侵蚀 */
    if (m.regen > 0) p.hp = Math.min(p.maxHp, p.hp + m.regen * dt / 60);
    if (p.shieldMax > 0) p.shield = Math.min(p.shieldMax, p.shield + 0.35 * dt);
    if (fx.decay > 0) { p.hp -= fx.decay * dt / 60; if (p.hp <= 0) { this.die(); return; } }
    /* 停着不动会一直掉血：波相「淤」的 drain。 */
    if (R.drain) {
      this.stillT = moved ? 0 : (this.stillT || 0) + dt;
      if (this.stillT > 50) {
        p.hp -= R.drain * (0.6 + this.wave * 0.02) * dt / 60;
        if (p.hp <= 0) { this.die(); return; }
      }
    }

    /* ---- 波次调度 ---- */
    if (this.waveGap > 0) {
      this.waveGap -= dt;
      if (this.waveGap <= 0) this.startWave(this.wave + 1);
    } else {
      this.spawnT += dt;
      this.waveLeft -= dt;
      while (this.spawnQ.length && this.spawnQ[0].at <= this.spawnT) {
        this.spawnEnemy(this.spawnQ.shift().kind);
      }
      if (!this.spawnQ.length && (!this.enemies.length || this.waveLeft <= 0)) {
        this.waveGap = 100;
        /* 清空一波回一口气：回血来路太少，这是最稳定的一条 */
        var gotW = this.heal(this.player.maxHp * HEAL.waveClear);
        if (gotW > 0.5) MC.bus.toast('第 ' + this.wave + ' 波清空 · 回 ' + Math.round(gotW) + ' 血');
        if (this.opts.onWaveClear) this.opts.onWaveClear(this.wave, gotW);
      }
    }

    /* ---- 敌人 ---- */
    var ctxAI = this.aiCtx();
    var i, e;
    this._grid.build(this.enemies);

    /* 穹：给身边一圈撑盾 */
    for (i = 0; i < this.enemies.length; i++) this.enemies[i].auraed = 0;
    for (i = 0; i < this.enemies.length; i++) {
      e = this.enemies[i];
      if (!e.aura) continue;
      var grp = this._grid.near(e.x, e.y, []);
      for (var j = 0; j < grp.length; j++) {
        var o = grp[j];
        if (o !== e && dist2(e.x, e.y, o.x, o.y) < e.aura * e.aura) o.auraed = 1;
      }
      e.auraed = 1;
    }

      for (i = this.enemies.length - 1; i >= 0; i--) {
        e = this.enemies[i];
        MC.enemies.step(e, ctxAI, dt);
        if (e.dead) {
          if (!e.eaten) this.onEnemyDead(e);
          this.enemies.splice(i, 1);
          continue;
        }
        /* 撞玩家：判定走**点**，推开走**面**。
           旧版把整个 p.r 都当碰撞箱，于是「收束」这类减体积的元件
           实际上没有变强——现在受击只认中心那一点点。 */
        var hr = p.hitR;
        var reach = e.r * 0.72 + hr;      /* 敌人的前缘推到判定点就算碰到 */
        if (dist2(e.x, e.y, p.x, p.y) < reach * reach) {
          this.hurtPlayer(e.dmg * 0.55);
          if (m.thorn > 0 && !MC.enemies.invulnerable(e)) {
            e.hp -= m.thorn * 26;
            e.flash = 4;
            if (e.hp <= 0) { e.dead = true; this.onEnemyDead(e); this.enemies.splice(i, 1); continue; }
          }
        }
        /* 推开：只推到「接触」为止，不再往外弹。
           两条约束夹住了这一个数：
             · 旧版无条件对每个敌人每帧往外挪 62px、且不吃 dt。AI 一帧只走一两像素，
               却被打回去 62，净效果是每秒被推开三千多像素——敌人一路顶到墙上，
               再顺着墙滑进角落里钉死，永远靠不过来，波次也就永远清不掉。
             · 但也不能按可见体积推到 e.r + p.r（对灰针是 23px）：
               受击走点，判定距离只有 e.r*0.72 + hitR（约 11px）。停在 23px 上的敌人
               永远够不到判定点，接触伤害就再也不会发生——追人的那批等于没有威胁。
           所以推开的上界就是接触本身：推到它的前缘刚刚贴上判定点。
           它仍然吃 e.r，越厚的东西停位越远，只是远不了多少。 */
        var kx = e.x - p.x, ky = e.y - p.y;
        var kd = Math.hypot(kx, ky) || 1;
        if (kd < reach) {
          /* 贴脸时方向会退化，给一个稳定的法线，免得原地抖动 */
          if (kd < 0.001) { kx = 1; ky = 0; kd = 1; }
          var over = reach - kd + 0.5;
          e.x = clamp(e.x + kx / kd * over, 10, W - 10);
          e.y = clamp(e.y + ky / kd * over, 10, H - 10);
        }
      }

    /* 阶跃第五级「生态」：一部分东西长了胃口。原本怎么走还是怎么走，只是会吃。
       吃掉的那一方变大、变厚，且这一份不算你的击杀。 */
    if (this.ladderFx && this.ladderFx.devour) {
      for (i = this.enemies.length - 1; i >= 0; i--) {
        e = this.enemies[i];
        if (!e.hunger) { if (this.rrng() < 0.22) e.hunger = 1; else continue; }
        if (e.coolH > 0) { e.coolH -= dt; continue; }
        var prey = ctxAI.nearest(e, 160, true);
        if (!prey) continue;
        if (dist2(e.x, e.y, prey.x, prey.y) > (e.r + prey.r + 6) * (e.r + prey.r + 6)) continue;
        e.hp += prey.maxHp * 0.4; e.maxHp += prey.maxHp * 0.4;
        e.r = Math.min(34, e.r + 0.6);
        prey.dead = true; prey.eaten = true;
        e.coolH = 90;
        this.addEmber(prey.x, prey.y, 20, 16, 1);
        var pi = this.enemies.indexOf(prey);
        if (pi >= 0) this.enemies.splice(pi, 1);
      }
    }

    if (this.boss) this.stepBoss(dt);

    /* ---- 开火：默认方向只来自鼠标 ----
       开火节奏还是自动的（那是系统的一部分），方向是玩家的。
       设置里的「锁最近」会把方向换回自动选敌——那是另一个玩法，不是补丁。
       环轨与分身任何时候都各自选敌，它们是「系统自己跑」的那一层。 */
    this.fireTick = (this.fireTick || 0) - dt * (1000 / 60);
    if (this.fireTick <= 0) {
      this.fireTick = m.rate;
      var av2 = this.aimVec();
      var lockOn = (this.prefs().aim === 'lock');
      var tgt = lockOn ? this.pickTarget(p.x, p.y) : null;
      var tx, ty;
      if (tgt) { tx = tgt.x; ty = tgt.y; }
      else { tx = p.x + av2.x * 400; ty = p.y + av2.y * 400; }
      this.fire(p.x, p.y, tx, ty, 1);
      if (m.echo > 0) {
        var self2 = this, token = this.runToken;
        setTimeout(function () {
          if (token !== self2.runToken || self2.over || self2.paused) return;
          var a2 = self2.aimVec();
          self2.fire(self2.player.x, self2.player.y,
                     self2.player.x + a2.x * 400, self2.player.y + a2.y * 400, 0.8);
        }, 90);
      }
      for (i = 0; i < this.orbiters.length; i++) {
        var t2 = this.pickTarget(this.orbiters[i].x, this.orbiters[i].y);
        if (t2) this.fire(this.orbiters[i].x, this.orbiters[i].y, t2.x, t2.y, 0.7);
      }
      for (i = 0; i < this.clones.length; i++) {
        var t3 = this.pickTarget(this.clones[i].x, this.clones[i].y);
        if (t3) this.fire(this.clones[i].x, this.clones[i].y, t3.x, t3.y, 0.8);
      }
    }

    /* 环轨与分身 */
    var wantOrbit = Math.round(m.orbit) + (this.ladderFx ? this.ladderFx.autoTurret : 0);
    while (this.orbiters.length < wantOrbit) this.orbiters.push({ ang: this.orbiters.length * 1.7 });
    while (this.orbiters.length > wantOrbit) this.orbiters.pop();
    for (i = 0; i < this.orbiters.length; i++) {
      var ob = this.orbiters[i];
      ob.ang += 0.028 * dt;
      ob.x = p.x + Math.cos(ob.ang) * 62;
      ob.y = p.y + Math.sin(ob.ang) * 62;
    }
    var wantClone = Math.round(m.clone);
    while (this.clones.length < wantClone) this.clones.push({ ox: 0, oy: 0, lx: p.x, ly: p.y });
    while (this.clones.length > wantClone) this.clones.pop();
    for (i = 0; i < this.clones.length; i++) {
      var cl = this.clones[i];
      var la = this.time / 70 + i * Math.PI;
      cl.lx += (p.x + Math.cos(la) * 54 - cl.lx) * 0.16 * dt;
      cl.ly += (p.y + Math.sin(la) * 54 - cl.ly) * 0.16 * dt;
      cl.x = cl.lx; cl.y = cl.ly;
    }

    /* ---- 子弹 ---- */
    for (i = this.bullets.length - 1; i >= 0; i--) {
      var b = this.bullets[i];
      b.px = b.x; b.py = b.y;
      b.life -= dt;
      if (b.homing > 0) {
        var ht = this.pickTarget(b.x, b.y);
        if (ht) {
          var ha = Math.atan2(ht.y - b.y, ht.x - b.x);
          var ca = Math.atan2(b.vy, b.vx);
          ca += Math.atan2(Math.sin(ha - ca), Math.cos(ha - ca)) * b.homing * 0.22 * dt;
          var bs = Math.hypot(b.vx, b.vy);
          b.vx = Math.cos(ca) * bs; b.vy = Math.sin(ca) * bs;
        }
      }
      if (this.on('jam')) {
        b.vx += Math.sin((this.time + b.life) / 22) * 0.05 * dt;
        b.vy += Math.cos((this.time + b.life) / 26) * 0.05 * dt;
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.life <= 0 || b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) {
        this.bullets.splice(i, 1); continue;
      }
      this.hitTest(b, i);
    }

    /* ---- 当波事件「雨」：天上有东西下来。只管这一波。 ---- */
    if (this.on('rain') && this.wave > 0) {
      if (this.rrng() < 0.05) {
        this.ebullets.push({
          x: this.rrng() * W, y: -6, vx: (this.rrng() - 0.5) * 0.6, vy: 2.4 + this.wave * 0.02,
          r: 4, dmg: 5 + this.wave * 0.35, life: 340, hue: 200
        });
      }
      while (this.ebullets.length > 240) this.ebullets.shift();
    }

    /* ---- 敌方弹 ---- */
    for (i = this.ebullets.length - 1; i >= 0; i--) {
      var eb = this.ebullets[i];
      eb.life -= dt;
      eb.x += eb.vx * dt; eb.y += eb.vy * dt;
      if (eb.life <= 0 || eb.x < -20 || eb.x > W + 20 || eb.y < -20 || eb.y > H + 20) {
        this.ebullets.splice(i, 1); continue;
      }
      /* 判定点：只看中心，不看整个身子 */
      var ebr = eb.r * 0.5 + p.hitR;
      if (dist2(eb.x, eb.y, p.x, p.y) < ebr * ebr) {
        this.hurtPlayer(eb.dmg);
        this.ebullets.splice(i, 1);
      }
    }

    /* ---- 区域：蠹 / 罟 / 波相「淤」留下的斑与网 ---- */
    var inSlow = 0;
    var zoneDrain = (R.zoneHp != null ? R.zoneHp : 1);
    for (i = this.zones.length - 1; i >= 0; i--) {
      var zn = this.zones[i];
      zn.life -= dt;
      if (zn.life <= 0) { this.zones.splice(i, 1); continue; }
      var zr = zn.r * 0.8 + p.hitR;
      if (dist2(zn.x, zn.y, p.x, p.y) < zr * zr) {
        p.hp -= zn.dps * zoneDrain * dt / 60;
        if (zn.slow) inSlow = Math.max(inSlow, zn.slow);
        if (p.hp <= 0) { this.die(); return; }
      }
    }
    this.slowed = inSlow;

    /* ---- 光束（杼 划的那条线） ---- */
    for (i = this.beams.length - 1; i >= 0; i--) {
      this.beams[i].life -= dt;
      if (this.beams[i].life <= 0) this.beams.splice(i, 1);
    }

    /* ---- 余烬：走过去收掉，蓄能就涨 ---- */
    for (i = this.embers.length - 1; i >= 0; i--) {
      var em = this.embers[i];
      /* 蓄能满槽会触发净化，净化会把整炉余烬倒空——这一趟就到此为止 */
      if (!em) break;
      em.life -= dt;
      if (em.life <= 0) { this.embers.splice(i, 1); continue; }
      var ed = Math.hypot(em.x - p.x, em.y - p.y);
      var er = em.r * 0.6 + p.hitR;
      if (ed < er) {
        /* 旧版这里写着 !em.mild 才充能，而所有 addEmber 调用都传 mild=1，
           于是余烬这条路从来没通过电。mild 只管它飘不飘、咬不咬人，不再管充能。 */
        this.gainCharge(CHARGE.ember);
        this.heal(HEAL.ember);
        this.embers.splice(i, 1);
        continue;
      }
      /* 快烧完的余烬会自己飘向你，蹭到只掉一点点血 */
      if (em.life < 40 && !em.mild) {
        var ux = (p.x - em.x) / (ed || 1), uy = (p.y - em.y) / (ed || 1);
        em.x += ux * 0.5 * dt; em.y += uy * 0.5 * dt;
        if (ed < p.hitR + 6) this.hurtPlayer(2.5 + this.wave * 0.06);
      }
    }

    /* ---- 掉落吸取 ---- */
    for (i = this.orbs.length - 1; i >= 0; i--) {
      var o2 = this.orbs[i];
      o2.life -= dt;
      var od = Math.hypot(o2.x - p.x, o2.y - p.y);
      if (od < m.magnet) {
        var k2 = (1 - od / m.magnet) * 0.5 + 0.08;
        o2.x += (p.x - o2.x) * k2 * 0.2 * dt;
        o2.y += (p.y - o2.y) * k2 * 0.2 * dt;
      }
      if (od < p.r + 10) { this.pickup(o2.mid); this.orbs.splice(i, 1); continue; }
      if (o2.life <= 0) this.orbs.splice(i, 1);
    }

    /* ---- 几何障：挡人、挡弹。血量走波相的 wallHp，所以可以被压薄。 ---- */
    for (i = 0; i < this.drifts.length; i++) {
      var df = this.drifts[i];
      df.x += df.vx * dt; df.y += df.vy * dt;
      if (df.x < 60 || df.x > W - 60) df.vx *= -1;
      if (df.y < 60 || df.y > H - 60) df.vy *= -1;
      df.x = clamp(df.x, 60, W - 60); df.y = clamp(df.y, 60, H - 60);
      if (df.flash > 0) df.flash -= dt;
      if (Math.abs(p.x - df.x) < df.w / 2 + p.r && Math.abs(p.y - df.y) < df.h / 2 + p.hitR) {
        var sgn = p.x < df.x ? -1 : 1;
        p.x = clamp(p.x + sgn * 6 * dt, 18, W - 18);
        this.hurtPlayer(4);
      }
    }

    /* ---- 背景浮尘 ---- */
    for (i = 0; i < this.dust.length; i++) {
      var du = this.dust[i];
      du.x += du.vx * dt; du.y += du.vy * dt;
      if (du.x < 0) du.x += W; else if (du.x > W) du.x -= W;
      if (du.y < 0) du.y += H; else if (du.y > H) du.y -= H;
    }

    /* 帧末：蓄能满槽的净化在这里统一放，避免在遍历中途改数组 */
    this.flushPurge();
  };

  Engine.prototype.gainCharge = function (n) {
    if (this.over || !(n > 0)) return;
    var nu = this._nu || MC.nursery.effects();
    this.charge += n * (nu.chargeRate || 1);
    /* 满槽不在这一帧立刻放：充能可能来自命中判定、连锁或净化的递归调用，
       当场展开会在遍历中途改动 enemies / bullets。挂一面旗，帧末统一收。 */
    if (this.charge >= 100) this._purgeQueued = true;
  };

  /* 帧末收口：一帧最多放一次净化，多出来的蓄能结转下去。 */
  Engine.prototype.flushPurge = function () {
    if (!this._purgeQueued) return;
    this._purgeQueued = false;
    if (this.over || this.charge < 100) return;
    this.charge -= 100;
    if (this.charge > 100) this.charge = 100;
    this.purges++;
    this.purge();
  };

  /* 蓄能满槽：净化。清掉场上余烬，附近一圈吃一发重的，并回一口气。 */
  Engine.prototype.purge = function () {
    var p = this.player;
    var dmg = 40 + this.wave * 6 + this.mods.mods.dmg * 2;
    for (var i = this.enemies.length - 1; i >= 0; i--) {
      var e = this.enemies[i];
      if (dist2(e.x, e.y, p.x, p.y) < 300 * 300) {
        e.hp -= dmg;
        e.flash = 6;
        if (e.hp <= 0) { e.dead = true; this.onEnemyDead(e); this.enemies.splice(i, 1); }
      }
    }
    if (this.boss) {
      for (var q = 0; q < this.boss.parts.length; q++) {
        var pt = this.boss.parts[q];
        if (pt.hp > 0) { pt.hp -= dmg * 0.6; pt.flash = 6; }
      }
    }
    /* 净化顺带把几何障也敲掉一块——它是「这一波给你的那口气」 */
    for (var b = 0; b < this.drifts.length; b++) {
      var df = this.drifts[b];
      if (dist2(df.x, df.y, p.x, p.y) < 300 * 300) df.hp -= dmg * 0.5;
    }
    this.drifts = this.drifts.filter(function (d) { return d.hp > 0; });
    this.embers.length = 0;
    this.addEmber(p.x, p.y, 300, 22, 1);
    this.invuln = Math.max(this.invuln, HURT_CD);
    /* 净化也回血：它是「这一波给你的那口气」，清场与喘息是同一件事 */
    var got = this.heal(p.maxHp * HEAL.purge);
    MC.audio.wave();
    MC.bus.toast('净化 · 蓄能放空了' + (got > 0.5 ? ' · 回 ' + Math.round(got) + ' 血' : ''));
  };

  /* 回血的唯一出口。所有来路都走这里，上限只在这一处收。 */
  Engine.prototype.heal = function (n) {
    if (!(n > 0) || this.over) return 0;
    var p = this.player;
    var before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + n);
    return p.hp - before;
  };

  /* 选敌：**只**给环轨与分身用。玩家手上那一件走鼠标。
     保留这个函数是因为「系统自己选目标」是本作的一条主张，
     但它不再参与玩家自己的准头。 */
  Engine.prototype.pickTarget = function (x, y) {
    var best = null, bd = Infinity;
    var i, e;
    for (i = 0; i < this.enemies.length; i++) {
      e = this.enemies[i];
      if (e.dead || MC.enemies.invulnerable(e)) continue;
      var d = dist2(x, y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    if (this.boss && this.boss.aliveParts > 0) {
      for (i = 0; i < this.boss.parts.length; i++) {
        if (this.boss.parts[i].hp <= 0) continue;
        var pp = this.partPos(this.boss, i);
        var d2 = dist2(x, y, pp.x, pp.y);
        if (d2 < bd) { bd = d2; best = { x: pp.x, y: pp.y, r: 17, hp: 1, maxHp: 1, bossPart: i }; }
      }
    } else if (this.boss) {
      var d3 = dist2(x, y, this.boss.x, this.boss.y);
      if (d3 < bd) { bd = d3; best = this.boss; }
    }
    return best;
  };

  Engine.prototype.partPos = function (b, i) {
    var a = b.parts[i].ang + b.spin;
    return { x: b.x + Math.cos(a) * 78, y: b.y + Math.sin(a) * 78 };
  };

  Engine.prototype.stepBoss = function (dt) {
    var b = this.boss, p = this.player;
    b.spin += 0.012 * dt;
    b.phase += dt;
    b.x += Math.sin(b.phase / 120) * 1.1 * dt;
    b.y = 150 + Math.sin(b.phase / 160) * 40;
    b.aliveParts = 0;
    for (var i = 0; i < b.parts.length; i++) {
      if (b.parts[i].hp > 0) b.aliveParts++;
      if (b.parts[i].flash > 0) b.parts[i].flash -= dt;
    }
    if (dist2(b.x, b.y, p.x, p.y) < (b.r * 0.72 + p.hitR) * (b.r * 0.72 + p.hitR)) {
      this.hurtPlayer(26 + this.wave);
      p.x -= (b.x - p.x) * 0.1;
      p.y -= (b.y - p.y) * 0.1;
    }
    this.bossAttack(dt);
  };

  /* Boss 的出手。旧版六个 Boss 只是「零件数不一样」——打起来是同一场戏。
     现在每一只有一套自己的节奏，破件只决定你什么时候能碰到芯。
     部件还在的时候出手慢（破一件快一点），全破了之后它才真的开始：
     那一段是这一场真正要你走位的部分。 */
  Engine.prototype.bossAttack = function (dt) {
    var b = this.boss, p = this.player;
    if (!b || this.on('silent')) return;
    var ai = (b.def && b.def.ai) || 'ring';
    var ux = p.x - b.x, uy = p.y - b.y;
    var ud = Math.hypot(ux, uy) || 1;
    ux /= ud; uy /= ud;
    /* 破一件，出手快一分。这是「先破件」唯一的即时回报。 */
    var frac = b.parts.length ? b.aliveParts / b.parts.length : 0;
    b.cool = (b.cool || 0) - dt * (1 + (1 - frac) * 1.4);
    if (b.cool > 0) return;
    var i, a;
    switch (ai) {
      case 'ring':
        b.cool = 96;
        b.arc = (b.arc || 0) + 0.31;
        for (i = 0; i < 12; i++) {
          a = b.arc + i * (Math.PI * 2 / 12);
          this.ebulletFrom(b.x, b.y, Math.cos(a), Math.sin(a), 2.5, 8 + this.wave * 0.5, b.def.hue);
        }
        break;
      case 'spiral':
        b.cool = 9;
        b.arc = (b.arc || 0) + 0.16;
        this.ebulletFrom(b.x, b.y, Math.cos(b.arc), Math.sin(b.arc), 2.6, 6 + this.wave * 0.35, b.def.hue);
        this.ebulletFrom(b.x, b.y, Math.cos(b.arc + Math.PI), Math.sin(b.arc + Math.PI), 2.6, 6 + this.wave * 0.35, b.def.hue);
        break;
      case 'beam':
        b.cool = 150;
        if (ud < 900) this.beams.push({
          x: b.x, y: b.y, ux: ux, uy: uy, len: 900, life: 16, max: 16,
          dmg: 16 + this.wave * 0.8, hue: b.def.hue
        });
        while (this.beams.length > CAP_BEAM) this.beams.shift();
        break;
      case 'summon':
        b.cool = 190;
        for (i = 0; i < 2; i++) {
          if (this.enemies.length >= MC.eff.eff('enemyCount', 170)) break;
          var m = MC.enemies.make('dust', this.wave, b.x + (i - 0.5) * 40, b.y + 40, this.rrng, 0.6, this.growth);
          m.__id = 'e' + (this._idc++);
          this.enemies.push(m);
        }
        break;
      case 'cross':
        b.cool = 130;
        b.arc = (b.arc || 0) + 0.22;
        for (i = 0; i < 4; i++) {
          a = b.arc + i * (Math.PI / 2);
          for (var k = -3; k <= 3; k++) {
            var aa = a + k * 0.055;
            this.ebulletFrom(b.x, b.y, Math.cos(aa), Math.sin(aa), 2.8, 7 + this.wave * 0.4, b.def.hue);
          }
        }
        break;
      case 'sweep':
        b.cool = 170;
        /* 横着扫：一条横贯全场的线，位置由相位决定，所以躲得开 */
        var sy = 80 + (Math.sin(b.phase / 90) * 0.5 + 0.5) * (H - 160);
        this.beams.push({
          x: 0, y: sy, ux: 1, uy: 0, len: W, life: 18, max: 18,
          dmg: 14 + this.wave * 0.7, hue: b.def.hue
        });
        while (this.beams.length > CAP_BEAM) this.beams.shift();
        break;
    }
  };

  /* Boss 的弹。走这里是为了让「静」风格那一类的开关也能把它按掉。 */
  Engine.prototype.ebulletFrom = function (x, y, ux, uy, sp, dmg, hue) {
    if (this.ebullets.length > 260) return;
    this.ebullets.push({ x: x, y: y, vx: ux * sp, vy: uy * sp, r: 4, dmg: dmg, life: 340, hue: hue });
  };

  Engine.prototype.hitTest = function (b, idx) {
    var i, e;
    /* 几何障挡弹：它有血，所以净化与「壳」类元件都能敲掉它。
       这一条让「手动瞄准」有了取舍——你得挑一条能穿过去的线。 */
    for (i = 0; i < this.drifts.length; i++) {
      var df = this.drifts[i];
      if (df.hp <= 0) continue;
      if (b.x < df.x - df.w / 2 || b.x > df.x + df.w / 2) continue;
      if (Math.abs(b.y - df.y) > df.h / 2 + b.r) continue;
      df.hp -= b.dmg;
      df.flash = 4;
      b.px = b.x; b.py = b.y;
      if (b.pierce <= 0) { this.bullets.splice(idx, 1); return; }
      b.pierce--;
    }
    this.drifts = this.drifts.filter(function (d) { return d.hp > 0; });

    /* Boss 部件优先 */
    if (this.boss) {
      for (i = 0; i < this.boss.parts.length; i++) {
        var pt = this.boss.parts[i];
        if (pt.hp <= 0) continue;
        var pp = this.partPos(this.boss, i);
        if (dist2(b.x, b.y, pp.x, pp.y) < (b.r + pt.r) * (b.r + pt.r)) {
          if (b.hit['p' + i]) continue;
          b.hit['p' + i] = 1;
          pt.hp -= b.dmg;
          pt.flash = 6;
          this.afterHit(b, pp.x, pp.y);
          if (pt.hp <= 0) { MC.audio.kill(); this.kills++; this.runKills++; this.dropAt(pp.x, pp.y, 2); }
          if (b.pierce <= 0) { this.bullets.splice(idx, 1); return; }
          b.pierce--;
        }
      }
      if (this.boss.aliveParts === 0) {
        if (dist2(b.x, b.y, this.boss.x, this.boss.y) < (b.r + this.boss.r) * (b.r + this.boss.r)) {
          if (!b.hit.boss) {
            b.hit.boss = 1;
            this.boss.hp -= b.dmg;
            this.boss.flash = 6;
            this.afterHit(b, this.boss.x, this.boss.y);
            if (this.boss.hp <= 0) {
              MC.audio.kill();
              this.kills++; this.runKills++;
              for (var q = 0; q < 8; q++) this.dropAt(this.boss.x, this.boss.y, 3);
              this.boss = null;
            }
          }
          if (b.pierce <= 0) { this.bullets.splice(idx, 1); return; }
          b.pierce--;
        }
      }
    }

    /* 宽相位：只取子弹附近的格子 */
    var near = this._grid.near(b.x, b.y, this._near);
    for (i = 0; i < near.length; i++) {
      e = near[i];
      if (e.dead || b.hit[e.__id]) continue;
      if (MC.enemies.invulnerable(e)) continue;
      var d = dist2(b.x, b.y, e.x, e.y);
      var rr = b.r + e.r;
      if (d > rr * rr) continue;

      b.hit[e.__id] = 1;
      var dmg = b.dmg;
      if (e.plate > 0) { dmg *= 0.35; e.plate = 0; }
      if (e.auraed) dmg *= 0.5;
      if (e.front > 0) {
        var ang = Math.atan2(e.y - b.y, e.x - b.x);
        var facing = Math.atan2(this.player.y - e.y, this.player.x - e.x);
        var rel = Math.abs(Math.atan2(Math.sin(ang - facing), Math.cos(ang - facing)));
        if (rel > 1.9) dmg *= e.front;
      }
      e.hp -= dmg;
      e.flash = 5;
      if (b.slow > 0) e.slow = 46;
      this.afterHit(b, e.x, e.y);

      if (e.hp <= 0) {
        e.dead = true;
        this.onEnemyDead(e);
        var at = this.enemies.indexOf(e);
        if (at >= 0) this.enemies.splice(at, 1);
        if (b.split > 0) this.spawnSplit(b, e);
      }
      if (b.pierce <= 0) { var bi = this.bullets.indexOf(b); if (bi >= 0) this.bullets.splice(bi, 1); return; }
      b.pierce--;
    }
  };

  Engine.prototype.afterHit = function (b, x, y) {
    /* 伤害也攒蓄能：打不死的东西照样在攒，所以堆伤害的构筑一样放得出净化 */
    this.gainCharge(b.dmg * CHARGE.dmg);
    if (b.blast > 0) this.blast(x, y, b.blast, b.dmg * 0.55);
    if (b.lifesteal > 0) {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + b.dmg * b.lifesteal);
    }
    if (b.chain > 0) this.chainFrom(x, y, b);
  };

  Engine.prototype.chainFrom = function (x, y, b) {
    var left = b.chain, from = { x: x, y: y }, guard = 0;
    while (left > 0 && guard++ < 8) {
      var near = this._grid.near(from.x, from.y, this._near2);
      var best = null, bd = 210 * 210;
      for (var i = 0; i < near.length; i++) {
        var e = near[i];
        if (e.dead || b.hit[e.__id] || MC.enemies.invulnerable(e)) continue;
        var d = dist2(from.x, from.y, e.x, e.y);
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) break;
      b.hit[best.__id] = 1;
      best.hp -= b.dmg * 0.62;
      best.flash = 5;
      if (best.hp <= 0) { best.dead = true; this.onEnemyDead(best); }
      from = { x: best.x, y: best.y };
      left--;
    }
  };

  Engine.prototype.blast = function (x, y, radius, dmg) {
    var near = this._grid.near(x, y, this._near2);
    for (var i = 0; i < near.length; i++) {
      var e = near[i];
      if (e.dead || MC.enemies.invulnerable(e)) continue;
      if (dist2(x, y, e.x, e.y) < radius * radius) {
        e.hp -= dmg;
        e.flash = 5;
        if (e.hp <= 0) { e.dead = true; this.onEnemyDead(e); }
      }
    }
    this.addEmber(x, y, radius * 0.7, 12, 1);
  };

  Engine.prototype.spawnSplit = function (b, from) {
    var n = Math.min(4, b.split);
    for (var i = 0; i < n; i++) {
      var a = i / n * Math.PI * 2;
      var s = Math.hypot(b.vx, b.vy) || 6;
      this.bullets.push({
        x: from.x, y: from.y, px: from.x, py: from.y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        r: 3, dmg: b.dmg * 0.5, pierce: 0, hit: {},
        homing: 0, chain: 0, blast: 0, split: 0, slow: b.slow, lifesteal: b.lifesteal,
        crit: 0, life: 60, hue: 150
      });
    }
  };

  /* 幂等：同一个敌人可能被直击 / 爆炸 / 连锁 / 净化同时判死，
     漏掉这一句就会重复计一次击杀、重复掉一份东西。 */
  Engine.prototype.onEnemyDead = function (e) {
    if (e.counted) return;
    e.counted = true;
    this.kills++;
    this.runKills++;
    this.gainCharge(CHARGE.kill);
    MC.audio.kill();
    var m = this.mods.mods;
    var fx = this.ladderFx || {};
    var R = this.rule || {};
    /* 元件不该随手就来：基础掉率压到 0.11，再乘构筑、阶跃、织构、纪元四层 */
    var chance = 0.11 * (m.dropMul || 1) * (fx.dropMul || 1) * (R.dropMul || 1);
    if (chance > 0.92) chance = 0.92;
    if (this.rrng() < chance) this.dropAt(e.x, e.y, 1);
    if (e.split > 0) {
      for (var i = 0; i < e.split; i++) {
        var ne = MC.enemies.make(e.kind, this.wave, e.x + (i - 0.5) * 22, e.y + (i - 0.5) * 22, this.rrng, 0.45, this.growth);
        ne.split = 0;
        ne.__id = 'e' + (this._idc++);
        this.enemies.push(ne);
      }
    }
    /* 精化「灼」：这一只死的时候炸一下。它死得慢一点，所以你有时间走开。 */
    if (e.burn) {
      var bc = this.aiCtx();
      bc.blast(e, 62, 14 + this.wave * 0.6);
    }
    /* 精化与镜像都掉双份——「这一只不一样」必须能被兑现 */
    if (e.elite) this.dropAt(e.x + 12, e.y + 12, 1);
    /* 类别的兑现：巨构掉三份、精英两份、华丽一份。
       它们比同波的东西难打，难的那一截必须换得到东西，
       否则「挑软的打」永远是唯一正确的答案。 */
    if (e.cls === 'mega') this.dropAt(e.x, e.y, 3);
    else if (e.cls === 'elite') this.dropAt(e.x + 8, e.y + 8, 2);
    else if (e.cls === 'gaudy') this.dropAt(e.x, e.y, 1);
    var respawn = Math.max(fx.respawnChance || 0, R.respawn || 0);
    if (respawn > 0 && this.rrng() < respawn) {
      var re = MC.enemies.make(e.kind, this.wave, e.x, e.y, this.rrng, 0.6, this.growth);
      re.__id = 'e' + (this._idc++);
      this.enemies.push(re);
    }
    if (this.opts.onKill) this.opts.onKill(this.runKills, e);
  };

  /* 掉落：只掉一件。掉什么由 rollDrop 的权重决定，
     旧版「掷一次 ROLLS 决定掉几个 / 成色多高 / 掉一把渣」那一层已删除——
     残渣现在从波相、纪元与自动机来，不再靠随机。 */
  Engine.prototype.dropAt = function (x, y, n) {
    var rng = MC.seed.rngFrom(this.seed, 'drop' + this.kills + '_' + Math.round(x));
    var nu = MC.nursery.effects();
    var R = this.rule || {};
    var bonus = (nu.outLvBonus || 0) + (R.outLv || 0);
    for (var i = 0; i < n; i++) {
      var m = MC.modules.rollDrop(this.wave, rng, bonus);
      if (!m) continue;
      this.orbs.push({
        x: x + MC.seed.range(rng, -14, 14), y: y + MC.seed.range(rng, -14, 14),
        mid: m.id, life: 900, hue: this.hueOf(m)
      });
    }
    while (this.orbs.length > CAP_ORB) this.orbs.shift();
  };

  Engine.prototype.addEmber = function (x, y, r, life, mild) {
    this.embers.push({ x: x, y: y, r: r, life: life, max: life, mild: mild });
    while (this.embers.length > CAP_EMBER) this.embers.shift();
  };

  Engine.prototype.hueOf = function (m) {
    return { ballistic: 190, chassis: 45, rule: 145, rare: 300 }[m.cat] || 200;
  };

  Engine.prototype.pickup = function (mid) {
    var st = MC.bus.state;
    MC.bus.invAdd(mid, 1);
    if (!st.found[mid]) {
      st.found[mid] = true;
      MC.bus.mark('stage', '发现元件 ' + (MC.modules.byId(mid) || {}).name);
      MC.bus.emit('found', mid);
    }
    MC.bus.save();
    MC.audio.pick();
    if (this.opts.onPick) this.opts.onPick(mid);
  };

  /* ================= 渲染 ================= */
  Engine.prototype.draw = function () {
    var c = this.ctx, m = this.mods ? this.mods.mods : null;
    if (!m) return;
    var p = this.player, i;
    var S = MC.cosmetics.stage();
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    if (this.shake > 0 && !MC.eff.calm() && this.prefs().fx) {
      var s = this.shake * 6;
      c.translate((this._vrng() - 0.5) * s, (this._vrng() - 0.5) * s);
    }

    /* 底：肤色 + 中心一点呼吸 */
    c.fillStyle = S.bg;
    c.fillRect(0, 0, W, H);
    var vg = c.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, 720);
    vg.addColorStop(0, S.glow);
    vg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = vg;
    c.fillRect(0, 0, W, H);

    /* 网格 */
    c.strokeStyle = S.grid;
    c.lineWidth = 1;
    for (var gx = 0; gx <= W; gx += 56) { c.beginPath(); c.moveTo(gx, 0); c.lineTo(gx, H); c.stroke(); }
    for (var gy = 0; gy <= H; gy += 56) { c.beginPath(); c.moveTo(0, gy); c.lineTo(W, gy); c.stroke(); }

    /* 浮尘 */
    for (i = 0; i < this.dust.length; i++) {
      var du = this.dust[i];
      c.fillStyle = S.dust + du.a.toFixed(3) + ')';
      c.beginPath(); c.arc(du.x, du.y, du.r, 0, Math.PI * 2); c.fill();
    }

    /* 收边区 */
    var inset = this.arenaInset();
    if (inset > 30) {
      c.strokeStyle = 'rgba(255,120,120,0.30)';
      c.lineWidth = 2;
      c.setLineDash([9, 7]);
      c.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
      c.setLineDash([]);
    }

    /* 区域斑 */
    for (i = 0; i < this.zones.length; i++) {
      var zn = this.zones[i];
      var a = Math.min(1, zn.life / zn.max) * (zn.slow ? 0.20 : 0.26);
      c.fillStyle = zn.slow ? 'rgba(120,200,220,' + a.toFixed(3) + ')' : 'rgba(150,220,120,' + a.toFixed(3) + ')';
      c.beginPath(); c.arc(zn.x, zn.y, zn.r, 0, Math.PI * 2); c.fill();
      c.strokeStyle = zn.slow ? 'rgba(150,225,245,0.35)' : 'rgba(180,240,150,0.35)';
      c.lineWidth = 1;
      c.beginPath(); c.arc(zn.x, zn.y, zn.r * (0.6 + 0.4 * Math.sin(this.time / 26 + i)), 0, Math.PI * 2); c.stroke();
    }

    /* 几何障：血量画成一道底边，所以「快被打穿了」看得见 */
    for (i = 0; i < this.drifts.length; i++) {
      var df = this.drifts[i];
      c.save(); c.translate(df.x, df.y); c.rotate(df.rot);
      c.fillStyle = df.flash > 0 ? 'rgba(255,255,255,0.35)' : 'rgba(200,210,230,0.10)';
      c.fillRect(-df.w / 2, -df.h / 2, df.w, df.h);
      c.strokeStyle = df.flash > 0 ? '#ffffff' : 'rgba(200,210,230,0.55)';
      c.lineWidth = 1.5;
      c.strokeRect(-df.w / 2, -df.h / 2, df.w, df.h);
      var fr = Math.max(0, Math.min(1, df.hp / df.maxHp));
      c.fillStyle = 'rgba(255,190,110,0.75)';
      c.fillRect(-df.w / 2, df.h / 2, df.w * fr, 2);
      c.restore();
    }

    /* 余烬 */
    for (i = 0; i < this.embers.length; i++) {
      var em = this.embers[i];
      var ea = (em.life / em.max);
      var glow = c.createRadialGradient(em.x, em.y, 1, em.x, em.y, em.r);
      glow.addColorStop(0, S.ember + (ea * 0.42).toFixed(3) + ')');
      glow.addColorStop(1, S.ember + '0)');
      c.fillStyle = glow;
      c.beginPath(); c.arc(em.x, em.y, em.r, 0, Math.PI * 2); c.fill();
      if (!em.mild) {
        c.strokeStyle = S.ember + (ea * 0.5).toFixed(3) + ')';
        c.lineWidth = 1;
        c.beginPath(); c.arc(em.x, em.y, em.r * 0.72, 0, Math.PI * 2); c.stroke();
      }
    }

    /* 掉落 */
    for (i = 0; i < this.orbs.length; i++) {
      var ob = this.orbs[i];
      var pulse = 0.5 + 0.5 * Math.sin(this.time / 12 + i);
      var og = c.createRadialGradient(ob.x, ob.y, 1, ob.x, ob.y, 16);
      og.addColorStop(0, hsl(ob.hue, 85, 76, 0.55));
      og.addColorStop(1, hsl(ob.hue, 85, 70, 0));
      c.fillStyle = og;
      c.beginPath(); c.arc(ob.x, ob.y, 16, 0, Math.PI * 2); c.fill();
      c.fillStyle = hsl(ob.hue, 80, 72, 0.95);
      this.poly(c, ob.x, ob.y, 5.2, 4, this.time / 26 + i);
      c.fill();
      c.strokeStyle = hsl(ob.hue, 85, 82, 0.45 + pulse * 0.3);
      c.lineWidth = 1;
      c.beginPath(); c.arc(ob.x, ob.y, 10 + pulse * 3, 0, Math.PI * 2); c.stroke();
    }

    /* 敌人 */
    for (i = 0; i < this.enemies.length; i++) this.drawEnemy(c, this.enemies[i]);

    /* Boss */
    if (this.boss) this.drawBoss(c);

    /* 光束 */
    for (i = 0; i < this.beams.length; i++) {
      var bm = this.beams[i];
      var ba = bm.life / bm.max;
      c.strokeStyle = hsl(bm.hue, 80, 70, (0.85 * ba).toFixed(3));
      c.lineWidth = 3 + 5 * ba;
      c.beginPath();
      c.moveTo(bm.x, bm.y);
      c.lineTo(bm.x + bm.ux * bm.len, bm.y + bm.uy * bm.len);
      c.stroke();
    }

    /* 子弹：带一小截尾迹 */
    for (i = 0; i < this.bullets.length; i++) {
      var bb = this.bullets[i];
      var bl = bb.crit ? 80 : 68;
      c.strokeStyle = hsl(bb.hue, 90, bl, 0.42);
      c.lineWidth = bb.r * 1.5;
      c.beginPath(); c.moveTo(bb.px, bb.py); c.lineTo(bb.x, bb.y); c.stroke();
      var bg = c.createRadialGradient(bb.x, bb.y, 0.5, bb.x, bb.y, bb.r * 3.4);
      bg.addColorStop(0, hsl(bb.hue, 95, bl, 0.85));
      bg.addColorStop(1, hsl(bb.hue, 95, bl, 0));
      c.fillStyle = bg;
      c.beginPath(); c.arc(bb.x, bb.y, bb.r * 3.4, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffffff';
      c.beginPath(); c.arc(bb.x, bb.y, bb.r * 0.55, 0, Math.PI * 2); c.fill();
    }
    for (i = 0; i < this.ebullets.length; i++) {
      var eb = this.ebullets[i];
      var eg = c.createRadialGradient(eb.x, eb.y, 0.5, eb.x, eb.y, eb.r * 3);
      eg.addColorStop(0, hsl(eb.hue, 80, 66, 0.8));
      eg.addColorStop(1, hsl(eb.hue, 80, 66, 0));
      c.fillStyle = eg;
      c.beginPath(); c.arc(eb.x, eb.y, eb.r * 3, 0, Math.PI * 2); c.fill();
      c.fillStyle = hsl(eb.hue, 85, 74, 0.95);
      c.beginPath(); c.arc(eb.x, eb.y, eb.r * 0.6, 0, Math.PI * 2); c.fill();
    }

    /* 环轨炮 */
    for (i = 0; i < this.orbiters.length; i++) {
      var ob2 = this.orbiters[i];
      c.strokeStyle = 'hsla(190,85%,74%,0.95)';
      c.lineWidth = 2;
      this.poly(c, ob2.x, ob2.y, 7, 3, this.time / 30);
      c.stroke();
      c.strokeStyle = 'hsla(190,85%,74%,0.28)';
      c.lineWidth = 1;
      c.beginPath(); c.arc(p.x, p.y, 62, 0, Math.PI * 2); c.stroke();
    }

    /* 分身 */
    for (i = 0; i < this.clones.length; i++) {
      var cl = this.clones[i];
      c.fillStyle = 'rgba(230,230,245,0.42)';
      this.poly(c, cl.x, cl.y, p.r * 0.8, 3, Math.atan2(p.hy, p.hx));
      c.fill();
      c.strokeStyle = 'rgba(230,230,245,0.5)';
      c.lineWidth = 1; c.stroke();
    }

    /* 玩家 */
    this.drawPlayer(c, p, m);
    /* 准星画在最上层：它是「你正在瞄哪」的唯一指示 */
    this.drawCross(c);

    /* 场上 HUD */
    c.font = '12px ui-monospace, Consolas, monospace';
    c.fillStyle = 'rgba(226,226,234,0.9)';
    c.fillText('第 ' + this.wave + ' 波', 14, 22);
    c.fillText('击杀 ' + MC.ladder.fmt(this.runKills), 14, 40);
    var ph = MC.waves.activePhases(this.wave);
    if (ph.length) {
      c.fillStyle = 'rgba(255,215,120,0.9)';
      c.fillText('波相 ' + ph.map(function (x) { return x.name; }).join(' '), 14, 58);
    }
    var bx = 14, by = 74, bw = 190, bh = 8;
    c.fillStyle = 'rgba(255,255,255,0.08)';
    c.fillRect(bx, by, bw, bh);
    c.fillStyle = 'rgba(120,230,180,0.95)';
    c.fillRect(bx, by, bw * Math.max(0, p.hp / p.maxHp), bh);
    if (p.shieldMax > 0) {
      c.fillStyle = 'rgba(150,230,255,0.85)';
      c.fillRect(bx, by + bh + 2, bw * Math.max(0, p.shield / p.shieldMax), 3);
    }
    /* 蓄能槽 */
    var cy2 = by + bh + (p.shieldMax > 0 ? 7 : 3);
    c.fillStyle = 'rgba(255,255,255,0.07)';
    c.fillRect(bx, cy2, bw, 5);
    c.fillStyle = 'rgba(255,190,110,0.95)';
    c.fillRect(bx, cy2, bw * Math.max(0, this.charge / 100), 5);
    c.fillStyle = 'rgba(255,205,150,0.75)';
    c.font = '10px ui-monospace, Consolas, monospace';
    c.fillText('蓄能 ' + Math.floor(this.charge) + '%', bx + bw + 8, cy2 + 6);

    if (this.waveGap > 0 && this.wave > 0) {
      c.fillStyle = 'rgba(226,226,234,0.85)';
      c.font = '14px ui-monospace, Consolas, monospace';
      c.textAlign = 'center';
      c.fillText('下一波 ' + Math.ceil(this.waveGap / 60 * 100) / 100 + 's', W / 2, H / 2 - 40);
      c.textAlign = 'left';
    }

    if (this.paused) {
      c.fillStyle = 'rgba(7,7,10,0.72)';
      c.fillRect(0, 0, W, H);
      c.textAlign = 'center';
      c.fillStyle = '#eef0f8';
      c.font = '600 22px ui-monospace, Consolas, monospace';
      c.fillText('已 暂 停', W / 2, H / 2 - 6);
      c.fillStyle = 'rgba(180,180,200,0.9)';
      c.font = '12px ui-monospace, Consolas, monospace';
      c.fillText('P 或 Esc 继续　·　R 重置本局', W / 2, H / 2 + 22);
      c.textAlign = 'left';
    }

    if (this.over) {
      c.fillStyle = 'rgba(7,7,10,0.78)';
      c.fillRect(0, 0, W, H);
      c.textAlign = 'center';
      c.fillStyle = '#eef0f8';
      c.font = '600 22px ui-monospace, Consolas, monospace';
      c.fillText('第 ' + this.wave + ' 波 · ' + MC.ladder.fmt(this.runKills) + ' 击杀', W / 2, H / 2 - 8);
      c.fillStyle = 'rgba(180,180,200,0.9)';
      c.font = '12px ui-monospace, Consolas, monospace';
      c.fillText('按 R 重置本局　·　元件与养成都留着', W / 2, H / 2 + 22);
      c.textAlign = 'left';
    }
  };

  Engine.prototype.drawEnemy = function (c, e) {
    var sides = SIDES[e.ai] || 3;
    var detail = DETAIL[e.ai] || 'core';
    var flash = e.flash > 0;
    var sunk = MC.enemies.invulnerable(e);
    var rot = this.time / 60 + e.phase + (e.ai === 'weave' ? e.spin : 0);
    var a = sunk ? 0.30 : 0.92;

    /* 外发光 */
    var g = c.createRadialGradient(e.x, e.y, 1, e.x, e.y, e.r * 2.6);
    g.addColorStop(0, hsl(e.hue, 70, 62, sunk ? 0.10 : 0.30));
    g.addColorStop(1, hsl(e.hue, 70, 62, 0));
    c.fillStyle = g;
    c.beginPath(); c.arc(e.x, e.y, e.r * 2.6, 0, Math.PI * 2); c.fill();

    /* 本体 */
    c.fillStyle = flash ? '#ffffff' : hsl(e.hue, 60, 42, a * 0.85);
    this.poly(c, e.x, e.y, e.r, sides, rot);
    c.fill();
    c.strokeStyle = flash ? '#ffffff' : hsl(e.hue, 72, 70, a);
    c.lineWidth = e.plate > 0 ? 2.6 : 1.3;
    c.stroke();

    /* 内构：形状告诉你它是哪一类，不写字 */
    c.strokeStyle = flash ? 'rgba(255,255,255,0.9)' : hsl(e.hue, 80, 78, a * 0.8);
    c.lineWidth = 1.1;
    if (detail === 'core') {
      c.fillStyle = hsl(e.hue, 80, 74, a * 0.7);
      c.beginPath(); c.arc(e.x, e.y, e.r * 0.32, 0, Math.PI * 2); c.fill();
    } else if (detail === 'ring') {
      c.beginPath(); c.arc(e.x, e.y, e.r * 0.55, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.arc(e.x, e.y, e.r * 0.26, 0, Math.PI * 2); c.stroke();
    } else if (detail === 'cross') {
      var q = e.r * 0.6;
      c.beginPath();
      c.moveTo(e.x - q, e.y); c.lineTo(e.x + q, e.y);
      c.moveTo(e.x, e.y - q); c.lineTo(e.x, e.y + q);
      c.stroke();
    } else if (detail === 'dot') {
      c.fillStyle = hsl(e.hue, 85, 76, a * 0.85);
      for (var d = 0; d < 3; d++) {
        var da = rot * 2 + d * (Math.PI * 2 / 3);
        c.beginPath(); c.arc(e.x + Math.cos(da) * e.r * 0.48, e.y + Math.sin(da) * e.r * 0.48, e.r * 0.14, 0, Math.PI * 2); c.fill();
      }
    } else if (detail === 'tri') {
      this.poly(c, e.x, e.y, e.r * 0.42, 3, -rot * 1.6);
      c.stroke();
    } else if (detail === 'bar') {
      var bw2 = e.r * 0.7;
      c.beginPath();
      c.moveTo(e.x - bw2, e.y - e.r * 0.18); c.lineTo(e.x + bw2, e.y - e.r * 0.18);
      c.moveTo(e.x - bw2, e.y + e.r * 0.18); c.lineTo(e.x + bw2, e.y + e.r * 0.18);
      c.stroke();
    }

    /* 状态标记 */
    if (e.plate > 0) {
      c.strokeStyle = 'rgba(220,235,255,0.85)';
      c.lineWidth = 1.6;
      this.poly(c, e.x, e.y, e.r + 5, 4, rot * 0.4);
      c.stroke();
    }
    if (e.auraed) {
      c.strokeStyle = 'rgba(150,200,255,0.6)';
      c.lineWidth = 1.2;
      c.beginPath(); c.arc(e.x, e.y, e.r + 4, 0, Math.PI * 2); c.stroke();
    }
    /* 精化：外圈 + 记号 + 一个字。
       看得见是这一层存在的全部理由——看不见的百分比堆叠已经被删掉了。 */
    if (e.elite) {
      c.strokeStyle = 'rgba(255,215,120,0.9)';
      c.lineWidth = 2;
      c.beginPath(); c.arc(e.x, e.y, e.r + 8, 0, Math.PI * 2); c.stroke();
      c.fillStyle = 'rgba(255,215,120,0.95)';
      c.font = '11px ui-monospace, Consolas, monospace';
      c.textAlign = 'center';
      c.fillText(e.eliteGlyph || '◆', e.x, e.y - e.r - 11);
      c.textAlign = 'left';
    }
    if (e.hunger) {
      c.strokeStyle = 'rgba(255,170,120,0.55)';
      c.lineWidth = 1;
      this.poly(c, e.x, e.y, e.r + 6, 7, rot * 1.3);
      c.stroke();
    }
    if (e.aura) {
      c.strokeStyle = 'rgba(150,200,255,0.22)';
      c.lineWidth = 1;
      c.setLineDash([5, 6]);
      c.beginPath(); c.arc(e.x, e.y, e.aura, 0, Math.PI * 2); c.stroke();
      c.setLineDash([]);
    }
    if (e.pull) {
      c.strokeStyle = 'rgba(255,150,150,0.28)';
      c.lineWidth = 1;
      c.beginPath(); c.arc(e.x, e.y, e.r + 12 + Math.sin(this.time / 18) * 5, 0, Math.PI * 2); c.stroke();
    }
    /* 眠：蓄力时外环在收，冲过之后画一个暗圈表示「这只已经没劲了」 */
    if (e.ai === 'lurk') {
      if (e.armed && e.cool > 0) {
        var prog = 1 - e.cool / 46;
        c.strokeStyle = 'rgba(255,90,90,' + (0.35 + prog * 0.55).toFixed(3) + ')';
        c.lineWidth = 2.4;
        c.beginPath();
        c.arc(e.x, e.y, e.r + 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog);
        c.stroke();
      } else if (e.spent) {
        c.strokeStyle = 'rgba(140,140,160,0.35)';
        c.lineWidth = 1;
        c.setLineDash([2, 4]);
        c.beginPath(); c.arc(e.x, e.y, e.r + 6, 0, Math.PI * 2); c.stroke();
        c.setLineDash([]);
      }
    }
    if (e.armed && (e.ai === 'sweep' || e.ai === 'coast')) {
      c.strokeStyle = 'rgba(255,90,90,0.7)';
      c.lineWidth = 1.5;
      c.beginPath(); c.arc(e.x, e.y, e.r + 8, 0, Math.PI * 2); c.stroke();
    }
    if (sunk) {
      c.strokeStyle = 'rgba(200,200,220,0.5)';
      c.lineWidth = 1;
      c.setLineDash([3, 5]);
      c.beginPath(); c.arc(e.x, e.y, e.r + 7, 0, Math.PI * 2); c.stroke();
      c.setLineDash([]);
    }

    /* 类别的记号：四类各有自己那一笔，看一眼就知道该不该为它改打法。
       这一层只画不判——它和精化徽记一样，存在的全部理由是「看得见」。 */
    if (e.cls === 'mega') {
      /* 巨构：外面套一层方框。它是几何体，不是生物。 */
      c.strokeStyle = hsl(e.hue, 40, 78, 0.55);
      c.lineWidth = 2;
      this.poly(c, e.x, e.y, e.r + 7, 4, rot * 0.35);
      c.stroke();
      c.lineWidth = 1;
      c.strokeStyle = hsl(e.hue, 30, 70, 0.32);
      this.poly(c, e.x, e.y, e.r + 14, 4, -rot * 0.2);
      c.stroke();
    } else if (e.cls === 'gaudy') {
      /* 华丽：里面多一圈转的花饰。它靠密度威胁人，所以画得也密。 */
      c.strokeStyle = hsl(e.hue, 78, 80, 0.6);
      c.lineWidth = 1;
      for (var gk = 0; gk < 5; gk++) {
        var ga = rot * 1.6 + gk * (Math.PI * 2 / 5);
        c.beginPath();
        c.arc(e.x + Math.cos(ga) * e.r * 0.62, e.y + Math.sin(ga) * e.r * 0.62, e.r * 0.22, 0, Math.PI * 2);
        c.stroke();
      }
    }

    /* 血条 */
    if (e.hp < e.maxHp) {
      var wq = (e.hp / e.maxHp) * e.r * 2;
      c.fillStyle = 'rgba(0,0,0,0.5)';
      c.fillRect(e.x - e.r, e.y - e.r - 8, e.r * 2, 3);
      c.fillStyle = hsl(e.hue, 78, 66, 0.95);
      c.fillRect(e.x - e.r, e.y - e.r - 8, wq, 3);
    }
  };

  Engine.prototype.drawBoss = function (c) {
    var b = this.boss, i;
    var alive = 0;
    for (i = 0; i < b.parts.length; i++) if (b.parts[i].hp > 0) alive++;

    /* 核心外圈 */
    var g = c.createRadialGradient(b.x, b.y, 4, b.x, b.y, b.r * 3.4);
    g.addColorStop(0, hsl(b.def.hue, 75, 60, alive ? 0.18 : 0.42));
    g.addColorStop(1, hsl(b.def.hue, 75, 60, 0));
    c.fillStyle = g;
    c.beginPath(); c.arc(b.x, b.y, b.r * 3.4, 0, Math.PI * 2); c.fill();

    /* 部件连线 */
    c.strokeStyle = hsl(b.def.hue, 60, 62, 0.35);
    c.lineWidth = 1;
    for (i = 0; i < b.parts.length; i++) {
      if (b.parts[i].hp <= 0) continue;
      var pp = this.partPos(b, i);
      c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(pp.x, pp.y); c.stroke();
    }
    /* 环 */
    c.strokeStyle = hsl(b.def.hue, 70, 70, 0.28);
    c.lineWidth = 1.5;
    c.beginPath(); c.arc(b.x, b.y, 78, 0, Math.PI * 2); c.stroke();

    for (i = 0; i < b.parts.length; i++) {
      var pt = b.parts[i];
      if (pt.hp <= 0) continue;
      var p2 = this.partPos(b, i);
      var frac = pt.hp / pt.maxHp;
      c.fillStyle = pt.flash > 0 ? '#fff' : hsl(b.def.hue, 62, 40 + 16 * frac, 0.9);
      this.poly(c, p2.x, p2.y, pt.r, 6, b.spin * 2 + i);
      c.fill();
      c.strokeStyle = pt.flash > 0 ? '#fff' : hsl(b.def.hue, 78, 76, 0.95);
      c.lineWidth = 1.6; c.stroke();
      /* 破损：血越少，边上的缺口越多 */
      if (frac < 0.66) {
        c.strokeStyle = 'rgba(20,20,26,0.7)';
        c.lineWidth = 2;
        var nk = frac < 0.33 ? 3 : 2;
        for (var k = 0; k < nk; k++) {
          var ka = b.spin * 2 + i + k * 2.1;
          c.beginPath();
          c.moveTo(p2.x + Math.cos(ka) * pt.r * 0.2, p2.y + Math.sin(ka) * pt.r * 0.2);
          c.lineTo(p2.x + Math.cos(ka) * pt.r * 0.9, p2.y + Math.sin(ka) * pt.r * 0.9);
          c.stroke();
        }
      }
      c.fillStyle = 'rgba(0,0,0,0.5)';
      c.fillRect(p2.x - pt.r, p2.y - pt.r - 8, pt.r * 2, 3);
      c.fillStyle = hsl(b.def.hue, 78, 68, 0.95);
      c.fillRect(p2.x - pt.r, p2.y - pt.r - 8, frac * pt.r * 2, 3);
    }

    c.fillStyle = b.flash > 0 ? '#fff' : (alive ? 'rgba(120,120,140,0.6)' : hsl(b.def.hue, 72, 60, 0.95));
    this.poly(c, b.x, b.y, b.r, 6, b.spin);
    c.fill();
    c.strokeStyle = hsl(b.def.hue, 85, 80, 0.95);
    c.lineWidth = 2.2; c.stroke();
    this.poly(c, b.x, b.y, b.r * 0.55, 6, -b.spin * 1.7);
    c.stroke();

    if (alive === 0) {
      c.fillStyle = 'rgba(0,0,0,0.5)';
      c.fillRect(b.x - b.r, b.y - b.r - 14, b.r * 2, 5);
      c.fillStyle = hsl(b.def.hue, 85, 72, 1);
      c.fillRect(b.x - b.r, b.y - b.r - 14, (b.hp / b.maxHp) * b.r * 2, 5);
    }
  };

  Engine.prototype.drawPlayer = function (c, p, m) {
    var S = MC.cosmetics.stage();
    var inv = this.invuln > 0 && Math.floor(this.time / 4) % 2 === 0;
    var rot = p.ang != null ? p.ang : Math.atan2(p.hy, p.hx);
    var dodge = this.dodgeFlash > 0;

    /* 拾取范围 */
    c.strokeStyle = 'rgba(190,240,255,0.09)';
    c.lineWidth = 1;
    c.beginPath(); c.arc(p.x, p.y, m.magnet, 0, Math.PI * 2); c.stroke();

    /* 外发光 */
    var g = c.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.r * 3.2);
    g.addColorStop(0, dodge ? 'rgba(255,240,180,0.42)' : 'rgba(200,240,255,0.34)');
    g.addColorStop(1, dodge ? 'rgba(255,240,180,0)' : 'rgba(200,240,255,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(p.x, p.y, p.r * 3.2, 0, Math.PI * 2); c.fill();

    /* 本体三层：这是**可见**体积，由 p.r 决定 */
    c.fillStyle = inv ? 'rgba(255,255,255,0.55)' : S.core;
    this.poly(c, p.x, p.y, p.r, 6, rot);
    c.fill();
    c.strokeStyle = S.coreLine;
    c.lineWidth = 1.6;
    c.stroke();
    c.strokeStyle = 'rgba(190,240,255,0.45)';
    c.lineWidth = 1;
    this.poly(c, p.x, p.y, p.r * 0.58, 6, -rot * 1.4);
    c.stroke();
    /* 朝向：指向准星方向，所以角色的「正面」永远是鼠标那一侧 */
    c.strokeStyle = 'rgba(255,255,255,0.75)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(p.x + Math.cos(rot) * p.r * 0.5, p.y + Math.sin(rot) * p.r * 0.5);
    c.lineTo(p.x + Math.cos(rot) * (p.r + 9), p.y + Math.sin(rot) * (p.r + 9));
    c.stroke();

    /* 判定点：中心这一点才是真正挨打的地方。
       画出来是为了让「判定点」这件事可见——它比可见体积小得多。 */
    c.strokeStyle = this.invuln > 0 ? 'rgba(255,150,120,0.95)' : 'rgba(255,255,255,0.55)';
    c.lineWidth = 1.2;
    c.beginPath(); c.arc(p.x, p.y, p.hitR, 0, Math.PI * 2); c.stroke();
    c.fillStyle = this.invuln > 0 ? 'rgba(255,190,170,0.95)' : 'rgba(255,255,255,0.8)';
    c.beginPath(); c.arc(p.x, p.y, 1.6, 0, Math.PI * 2); c.fill();

    if (p.shieldMax > 0 && p.shield > 0) {
      c.strokeStyle = 'rgba(150,230,255,' + (0.25 + 0.45 * (p.shield / p.shieldMax)).toFixed(3) + ')';
      c.lineWidth = 2;
      this.poly(c, p.x, p.y, p.r + 10, 6, this.time / 90);
      c.stroke();
    }
    if (this.slowed) {
      c.strokeStyle = 'rgba(150,225,245,0.5)';
      c.lineWidth = 1.4;
      c.setLineDash([4, 5]);
      c.beginPath(); c.arc(p.x, p.y, p.r + 15, 0, Math.PI * 2); c.stroke();
      c.setLineDash([]);
    }
    /* 蓄能快满时的提示环 */
    if (this.charge >= 70) {
      var cg = this.charge / 100;
      c.strokeStyle = 'rgba(255,190,110,' + (0.35 + 0.5 * cg).toFixed(3) + ')';
      c.lineWidth = 2.4;
      c.beginPath(); c.arc(p.x, p.y, p.r + 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * cg); c.stroke();
    }
  };

  /* 准星：鼠标那一侧。它不参与判定，但它是「手动瞄准」这件事的锚点。 */
  Engine.prototype.drawCross = function (c) {
    if (!this.mouse.inside) return;
    var x = this.mouse.x, y = this.mouse.y;
    var col = this.invuln > 0 ? 'rgba(255,150,120,0.9)' : 'rgba(230,240,255,0.75)';
    c.strokeStyle = col;
    c.lineWidth = 1.3;
    c.beginPath();
    c.moveTo(x - 9, y); c.lineTo(x - 3, y);
    c.moveTo(x + 3, y); c.lineTo(x + 9, y);
    c.moveTo(x, y - 9); c.lineTo(x, y - 3);
    c.moveTo(x, y + 3); c.lineTo(x, y + 9);
    c.stroke();
    c.beginPath(); c.arc(x, y, 2, 0, Math.PI * 2); c.stroke();
    /* 从角色指向准星的一条虚线：让你看清自己正在打哪 */
    var p = this.player;
    c.strokeStyle = 'rgba(230,240,255,0.10)';
    c.lineWidth = 1;
    c.setLineDash([3, 7]);
    c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(x, y); c.stroke();
    c.setLineDash([]);
  };

  Engine.prototype.poly = function (c, x, y, r, n, rot) {
    c.beginPath();
    for (var i = 0; i < n; i++) {
      var a = rot + i * (Math.PI * 2 / n);
      var px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath();
  };

  Engine.prototype.start = function () {
    if (this.running) return;
    this.running = true;
    this._last = performance.now();
    var self = this;
    var tick = function (now) {
      if (!self.running) return;
      var dt = now - self._last;
      self._last = now;
      if (dt > 80) dt = 80;
      self.step(dt);
      self.draw();
      self._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  };

  Engine.prototype.stop = function () {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  };

  MC.engine = { W: W, H: H, create: function (canvas, opts) { return new Engine(canvas, opts); } };
})(window.MC);
