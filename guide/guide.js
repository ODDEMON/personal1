/* ==========================================================================
   guide/guide.js —— 内置说明的渲染器
   --------------------------------------------------------------------------
   五条约定，改这个文件前先读：
     1. 本文件不存数据。它只读 world/*.js 与 core/*.js 里那几张声明表，
        表改了它就改。发现这里写死了某个数值 = bug，数值应该回到声明表去。
     2. 加一个页面 = 在 PAGES 里加一项，导航、路由、搜索索引自动认领。
     3. 所有数字格式化走 fmt()，所有块渲染走 card()/row()/def()。
        别在各处各拼一段 HTML——那会让改版变成考古。
     4. 渲染出来的一切都进 INDEX，所以搜索也是声明式的。
     5. **可玩内容必须展示得出来。** 新增一张表，就在这里加一页或一节；
        漏了的话玩家在游戏里碰到一个没写在任何地方的东西。

   诚实披露写在页面里（见「老实交代」），不藏在脚注里。
   低烈度模式与光敏提醒是硬性继承项，写在概览与老实交代两处。
   ========================================================================== */
(function () {
  'use strict';

  var MC = window.MC || {};
  var $ = function (id) { return document.getElementById(id); };

  /* ---- 单出口：数字与空值都从这里出 ---- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function fmt(n) {
    if (n == null || !isFinite(n)) return '—';
    if (Math.abs(n) >= 1000) return MC.ladder.fmt(n);
    return String(Math.round(n * 100) / 100);
  }
  function signed(n) { var s = fmt(n); return (n > 0 ? '+' : '') + s; }
  function pct(n) { return Math.round((n || 0) * 1000) / 10 + '%'; }

  /* 条形：0..1 映射到一段宽度。相对量才有意义时用它，绝对值直接写数字。 */
  function bar(v, max, red) {
    var w = Math.max(0, Math.min(1, (v || 0) / (max || 1)));
    return '<div class="bar' + (red ? ' r' : '') + '"><i style="width:' + (w * 100).toFixed(1) + '%"></i></div>';
  }

  function card(o) {
    return '<div class="card"><div class="hd">' +
      (o.glyph ? '<span class="g">' + esc(o.glyph) + '</span>' : '') +
      '<span class="nm">' + esc(o.name) + '</span>' +
      (o.badge ? '<span class="lv">' + esc(o.badge) + '</span>' : '') +
      '</div>' +
      (o.kv ? '<div class="kv">' + o.kv + '</div>' : '') +
      (o.body ? '<div class="bd">' + esc(o.body) + '</div>' : '') +
      (o.bar != null ? bar(o.bar, o.barMax, o.red) : '') +
      '</div>';
  }

  function row(cells, cls) {
    return '<tr' + (cls ? ' class="' + cls + '"' : '') + '>' +
      cells.map(function (c) { return '<td' + (c && c.cls ? ' class="' + c.cls + '"' : '') + '>' + (c && c.t != null ? c.t : esc(c)) + '</td>'; }).join('') +
      '</tr>';
  }
  function table(head, rows) {
    if (!rows.length) return '<div class="empty">这一栏暂时是空的。</div>';
    return '<table class="tbl"><thead><tr>' +
      head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows.join('') + '</tbody></table>';
  }
  function def(n, t) {
    return '<div class="def"><div class="n">' + esc(n) + '</div><div class="t">' + t + '</div></div>';
  }
  function err(n, t) {
    return '<div class="err"><div class="n">' + esc(n) + '</div><div class="t">' + t + '</div></div>';
  }
  function h3(t) { return '<h3>' + esc(t) + '</h3>'; }
  function note(t) { return '<p class="note">' + t + '</p>'; }
  function grid(items) { return '<div class="grid">' + items.join('') + '</div>'; }

  /* ---- 一张表：元件数值键 -> 人话。加一个键 = 加一项 ---- */
  var MOD_LABEL = {
    dmg: '伤害', rateMul: '射速×', pierce: '穿透', count: '弹数', spread: '散布',
    bulletSpeed: '弹速', radiusMul: '体型×', homing: '追迹', chain: '链击', blast: '爆裂',
    crit: '暴击', lifesteal: '汲取', slow: '迟滞', regen: '再生', shield: '护壁',
    split: '分裂', orbit: '环轨', clone: '分身', dash: '折跃', echo: '回声',
    magnet: '吸附', dropMul: '掉落×', dmgMul: '伤害×', thorn: '倒刺', size: '弹径',
    hp: '生命', speed: '移速'
  };
  var MUL_ISH = { rateMul: 1, dmgMul: 1, radiusMul: 1, crit: 1, lifesteal: 1 };
  var CAT_NAME = { ballistic: '弹道', chassis: '本体', rule: '规则', rare: '稀有' };

  function modText(mods) {
    var out = [];
    for (var k in mods) {
      if (MOD_LABEL[k] == null) continue;
      var v = mods[k];
      if (!v) continue;
      out.push(MOD_LABEL[k] + ' ' + (MUL_ISH[k] ? (Math.round(v * 100) / 100 + '×') : signed(v)));
    }
    return out.length ? out.join('　') : '空位也是一位';
  }

  /* 律的键 -> 人话 */
  var LAW_LABEL = {
    hpWave: '血量坡度', dropWave: '掉落随波次', rateWave: '开火间隔随波次',
    resWave: '残结算', bossWave: 'Boss 血量', waveGain: '一波时长', edge: '收边强度'
  };
  var STYLE_LABEL = {
    speedMul: '移速', rateMul: '射速', hpMul: '生命', spawnMul: '出场数',
    dropMul: '掉落', residueMul: '残渣', sizeMul: '弹径', hpWave: '血量坡度', quiet: '不抽当波事件'
  };

  function lawText(laws) {
    if (!laws) return '';
    return Object.keys(laws).map(function (k) {
      return (LAW_LABEL[k] || k) + ' ×' + laws[k];
    }).join('　');
  }

  /* ======================= 页面 ======================= */

  function buildOverview() {
    return def('定义 0.1　系统',
      '系统是一组互相咬合的规则，其输出<b>不等于</b>任一规则的输出之和。') +
      def('定义 0.2　涌现',
      '涌现是设计者写死之外、由系统自己跑出来的那一部分结果。<br>即：它不是被设计出来的，它是被<b>允许</b>出来的。') +
      def('定义 0.3　随机',
      '随机不是把数字搅乱，随机是同一份规则每一局落在不同的位置上。<br>等价于：可复现是随机的前提，不是它的对立面。') +
      h3('上手四步') +
      note('1. 进主舞台，<b>WASD</b> 挪，<b>鼠标</b>指方向。开火节奏是自动的——你挪，它打。<br>' +
        '2. 打到的元件去<b>装配台</b>装进环上的槽位。<b>挨着</b>的两个如果对得上，会长出第三样东西。<br>' +
        '3. 去<b>培养皿</b>把两个元件合掉——它当场扣、当场出，不吃时间。<br>' +
        '4. 倒下以后按本局表现结算<b>残渣</b>，去<b>养成室</b>换永久的东西。') +
      h3('这一局与一直留着') +
      note('每局重来的是：波次、本局击杀、生命、蓄能、织构，以及<b>没装上也没合掉的那些元件</b>。<br>' +
        '一直留着的是：<b>装在环上的装配</b>、已点亮的图鉴、养成节点、残渣、纪元、累计击杀与阶跃。<br>' +
        '说白了——倒下丢的是这一局捡到的东西，留下的是你已经改好的系统。') +
      h3('三个开关') +
      note('<b>冷静模式</b>只压上限（数量、速度、音量），规则一条不改。<br>' +
        '<b>声轨</b>默认静音，要你先点一下才出声；它不进任何判定，也不写进卷宗。<br>' +
        '<b>受击冷却</b>固定一秒，不随任何成长变化。');
  }

  function buildMechanics() {
    var e = MC.eff;
    return h3('移动与瞄准') +
      note('<b>移动只认键盘</b>（WASD / 方向键）。<b>方向只认鼠标</b>。' +
        '这两件事在旧版是混在一起的——鼠标能拖着人跑、也能自动选敌，' +
        '两套控制在同一帧里打架，表现出来就是「有时候准头自己飘掉」。' +
        '现在输入端只有一条路：走位是键盘，朝向是鼠标。') +
      note('开火<b>节奏</b>仍然是自动的。节奏是系统的一部分，方向是你的。' +
        '设置里另有「锁最近」，那会把方向换回自动选敌——那是另一个玩法，不是补丁。<br>' +
        '环轨与分身任何时候都各自选敌，它们是「系统自己跑」的那一层，与你手上这一件互不干扰。') +
      h3('判定点') +
      note('角色的<b>可见体积</b>与<b>受击判定</b>是两个数。可见体积由 <code>p.r</code> 决定，' +
        '受击只看中心那一个 <code>p.hitR</code>（基础 ' + fmt(4.5) + ' 像素）。<br>' +
        '旧版把整个可见体积当碰撞箱，于是「收束」「虚身」这类减体积的元件' +
        '<b>实际上一点没变强</b>——画变小了，判定照旧。<br>' +
        '现在两者分开：减体积真的会让你更难被打中，而画面照旧。' +
        '养成室的「虚身」再叠一层闪避率，判定流抽，所以可复现。<br>' +
        '所有伤害来源都用同一个判定点：接触、敌方弹、区域、光束、余烬灼烧。') +
      h3('受击冷却') +
      note('受击后进入 <b>60 帧（= 1 秒 @60fps）</b>的冷却。这一秒内<b>所有</b>伤害都进不来。<br>' +
        '它存在的理由是让死亡读得出因果——不是「一帧被打死十次」那种读不出前因后果的结算。' +
        '它<b>不随任何养成、风格或纪元变化</b>，因为它是一条判定规则，不是一个数值。') +
      h3('蓄能与净化') +
      note('收掉<b>余烬</b>会涨蓄能。满槽自动<b>净化</b>：清掉场上余烬，' +
        '身边一圈吃一发重的，顺带把附近的<b>几何障</b>也敲掉一块。' +
        '所以余烬是资源，不是惩罚。') +
      h3('掉落与等级') +
      note('基础掉率压在 <b>0.11</b>，再乘构筑、阶跃、织构、纪元四层的加成。' +
        '二级件第 6 波起、三级件第 14 波起；养成室的「上位 / 厚养」再抬一格。<br>' +
        '<b>每次击杀只掉一件</b>。旧版还会再掷一次骰子决定掉几个、成色多高、' +
        '或者掉一把渣——那一层已删除，残渣改从波相与纪元来。') +
      note('同名基型投进培养皿 = 往上长一级。这是高阶元件的主要来路，不是掉落。') +
      h3('波次与波相') +
      note('每一波另外抽一条<b>当波事件</b>（只管这一波）。' +
        '<b>波相</b>按波次依次开，一共 ' + MC.PHASES.length + ' 条，<b>条数封顶</b>——' +
        '你始终知道现在有哪几条在生效。<br>' +
        '（旧版是每 5 波叠一条永久变异，十条叠满之后场面已经认不出来了。那一套整体删除。）') +
      h3('几何障') +
      note('波相「障」会在场上立几道移动的几何障。它<b>挡弹也挡人</b>，而且<b>有血量</b>——' +
        '所以净化与穿透类元件都能敲掉它，障的底边画着一条耐久。<br>' +
        '它不是纯粹的惩罚：它把「手动瞄准」这件事重新变得有取舍，' +
        '你得挑一条能穿过去的线。') +
      h3('敌人血量') +
      note('随波次<b>二次</b>增长：<code>1 + 0.19w + 0.012w²</code>。' +
        '线性的后果是堆伤害和不堆伤害都能平推，构筑就没意义了。') +
      h3('钳制表') +
      table(['量', '上限', '冷静模式', '下限'], [
        row(['移速', { t: fmt(e.CAP.speed), cls: 'n' }, { t: fmt(e.CALM.speed || e.CAP.speed), cls: 'n' }, { t: fmt(e.FLOOR.speed), cls: 'n' }]),
        row(['敌人数', { t: fmt(e.CAP.enemyCount), cls: 'n' }, { t: fmt(e.CALM.enemyCount), cls: 'n' }, '—']),
        row(['弹丸数', { t: fmt(e.CAP.bulletCount), cls: 'n' }, '同上限', '—']),
        row(['开火间隔', { t: fmt(e.CAP.fireRate) + ' ms', cls: 'n' }, '同上限', { t: fmt(e.FLOOR.fireRate) + ' ms', cls: 'n' }]),
        row(['伤害', { t: fmt(e.CAP.damage), cls: 'n' }, '同上限', { t: fmt(e.FLOOR.damage), cls: 'n' }]),
        row(['生命', { t: fmt(e.CAP.hpMax), cls: 'n' }, '同上限', { t: fmt(e.FLOOR.hpMax), cls: 'n' }]),
        row(['穿透', { t: fmt(e.CAP.pierce), cls: 'n' }, '同上限', { t: fmt(e.FLOOR.pierce), cls: 'n' }]),
        row(['单次弹数', { t: fmt(e.CAP.projectile), cls: 'n' }, '同上限', { t: fmt(e.FLOOR.projectile), cls: 'n' }]),
        row(['判定点', '随养成', '同左', '—']),
        row(['受击冷却', { t: '60 帧', cls: 'nm' }, { t: '60 帧', cls: 'nm' }, { t: '60 帧', cls: 'nm' }])
      ]) +
      note('最后两行不参与「上限」这件事：判定点与受击冷却是判定规则，' +
        '不是可调数值。养成能改前者，后者的数值恒定，两者都归不了零。');
  }

  function buildEconomy() {
    var out = def('定义 E.1　元件是局内资源',
      '这一局捡到的元件，<b>没装上、没合掉的那些在局末退回熔炉</b>。' +
      '装在环上的装配、已点亮的图鉴、残渣与养成节点都留着。');
    out += def('定义 E.2　合成不吃时间',
      '合成<b>立刻</b>完成。代价是<b>两个元件本身</b>。');
    out += note('旧版每一条反应都带一个 12–240 秒的时长，代价是「等待」而不是「元件」。' +
      '于是培养皿可以无限白嫖：投两个、等着、收一个，库存从来不减，那一炉就永远开着——' +
      '「合成」这件事因此变得毫无意义。<br>' +
      '现在 <code>sec</code> 恒为 0，<code>rooms/culture.html</code> 的 <code>fuse()</code> ' +
      '当场扣掉两个元件，产物当场入库。' +
      '「元件是这一局捡的」与「这一局就要用掉」是同一件事的两面。');
    out += h3('库存的语义');
    out += note('<code>state.inventory</code> 记的是<b>未装配</b>的件数。' +
      '装进槽位时扣一个，卸下来时还一个。它有三个唯一写入口，都在 <code>core/bus.js</code>：' +
      '<code>invAdd</code> / <code>invTake</code> / <code>invClearRun</code>。' +
      '别在别处直接改 <code>state.inventory</code>。');
    out += h3('一局的账');
    out += table(['时点', '未装配元件', '装配', '残渣 / 养成 / 纪元'], [
      row(['进本局', { t: '退回熔炉，归零', cls: 'd' }, { t: '留着', cls: 'nm' }, { t: '留着', cls: 'nm' }]),
      row(['捡到', { t: '＋1', cls: 'd' }, { t: '不动', cls: 'nm' }, { t: '不动', cls: 'nm' }]),
      row(['装上槽位', { t: '−1', cls: 'd' }, { t: '这一格写上', cls: 'nm' }, { t: '不动', cls: 'nm' }]),
      row(['卸下', { t: '＋1', cls: 'd' }, { t: '这一格清空', cls: 'nm' }, { t: '不动', cls: 'nm' }]),
      row(['合成', { t: '−2，然后按产物 +0…+2', cls: 'd' }, { t: '不动', cls: 'nm' }, { t: '出渣时 +渣', cls: 'nm' }]),
      row(['局末', { t: '<b>归零</b>', cls: 'nm' }, { t: '<b>留着</b>', cls: 'nm' }, { t: '按本局表现结算', cls: 'nm' }])
    ]);
    out += h3('为什么这样分');
    out += note('合成有代价之后，「捡到什么」才是一个决定而不是一份收集。' +
      '局外留下的全是<b>改过的系统</b>（装配、养成、纪元），' +
      '局内消掉的是<b>这一局的素材</b>。' +
      '这两样分开之后，重开一局仍然有得玩，而培养皿重新变成一个真正的房间。');
    return out;
  }

  function buildModules() {
    var out = '';
    ['ballistic', 'chassis', 'rule', 'rare'].forEach(function (cat) {
      out += h3(CAT_NAME[cat] + '　' + MC.BASES.filter(function (b) { return b.cat === cat; }).length + ' 基型');
      var rows = MC.BASES.filter(function (b) { return b.cat === cat; }).map(function (b) {
        return row([
          { t: esc(b.glyph), cls: 'g' },
          { t: esc(b.name), cls: 'nm' },
          { t: b.levels > 1 ? ('Ⅰ–' + ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ'][b.levels - 1]) : '单级', cls: 'd' },
          { t: '阶 ' + b.tier, cls: 'd' },
          { t: '第 ' + b.min + ' 波', cls: 'd' },
          { t: modText(b.mods), cls: 'd' },
          { t: esc(b.note), cls: 'd' }
        ]);
      });
      out += table(['', '基型', '等级', '阶', '出现', '数值（一级）', '注脚'], rows);
    });
    out += h3('等级');
    out += note('等级由程序展开：基型 × 等级 = 独立元件，共 <b>' + MC.MODULES.length + '</b> 件。' +
      '缩放统一走 <code>lvScale(lv) = 1 + 0.6×(lv−1)</code>；乘算类的键先换算成差量再乘，' +
      '所以 0.82 不会越乘越小到失控。');
    out += h3('两个半径');
    out += note('「收束」「膨胀」「虚身」改的是<b>两个不同的半径</b>：' +
      '可见体积 <code>radiusMul</code> 决定画多大，' +
      '判定点 <code>hitMul</code> 决定多难被打中。' +
      '两者一起变小才是真的小；只改前者的话，画变小而判定不变，等于没变强。');
    return out;
  }

  function buildSynergy() {
    var out = note('协同按<b>基型</b>匹配，与等级无关；强度按两个槽位的平均等级放大。' +
      '所以「一级长枪」和「三级长枪」是两回事。');
    var rows = MC.SYNERGY.map(function (s) {
      var a = MC.modules.byId(s.a), b = MC.modules.byId(s.b);
      return row([
        { t: esc(a ? a.glyph : '·') + esc(b ? b.glyph : '·'), cls: 'g' },
        { t: esc(s.name), cls: 'nm' },
        { t: (a ? a.name : s.a) + ' ＋ ' + (b ? b.name : s.b), cls: 'd' },
        { t: modText(s.mods), cls: 'd' },
        { t: esc(s.note), cls: 'd' }
      ]);
    });
    out += table(['', '协同', '由哪两个', '数值', '注脚'], rows);
    out += h3('怎么读这张表');
    out += note('槽位是<b>环形</b>的：首尾也相邻。养成的「跨」解锁后，中间空一格也算挨着；' +
      '「紧」让咬合更深；「第七位」多一个槽位——六是个对称的数，七不是。');
    return out;
  }

  function buildNursery() {
    var BR = {
      root: '根 · 本体底子', branch: '枝 · 掉落与拾取', vein: '脉 · 培养皿',
      ring: '环 · 装配台', core: '核 · 阶跃与终局', law: '律 · 纪元'
    };
    var out = def('定义 N.1　残渣',
      '残渣是<b>局外货币</b>，每局倒下时按本局表现结算。' +
      '节点买下即永久生效；有一部分要孵一会儿，按<b>真实时间</b>走——关掉页面也在长。');
    out += note('六个分支，共 <b>' + MC.NURSERY.length + '</b> 个节点。' +
      '「律」改的是数字本身怎么长——这一支是后加的，' +
      '因为前面五支只让你变得更强，变不出<b>不一样</b>。');
    MC.BRANCHES.forEach(function (b) {
      var list = MC.nursery.branchOf(b);
      if (!list.length) return;
      out += h3(BR[b] + '　' + list.length + ' 个');
      out += grid(list.map(function (n) {
        return card({
          glyph: n.glyph, name: n.name, badge: n.cost + ' 渣',
          kv: (n.req.length ? '前置：' + n.req.map(function (r) { var x = MC.nursery.byId(r); return x ? x.name : r; }).join('、') : '无前置') +
            (n.sec > 0 ? '　·　孵 ' + n.sec + ' 秒' : '　·　立刻生效'),
          body: n.note
        });
      }));
    });
    out += h3('三类效果');
    out += note('<b>加进来</b>（<code>hpAdd</code> / <code>dmgAdd</code> / <code>speedAdd</code> …）' +
      '、<b>乘上去</b>（<code>rateMul</code> / <code>dropMul</code> / <code>synMul</code> …）、' +
      '<b>取大</b>（<code>slots</code> / <code>vatSlots</code> / <code>progBudget</code> …）。' +
      '表里没列出的键一律按「加」处理，所以加一个节点通常不用改汇总逻辑。');
    return out;
  }

  function buildReactions() {
    var out = def('定义　反应',
      '任意两个元件投进炉子都有反应。<b>' + MC.modules.baseIds().length + '</b> 个基型，' +
      '组合数 <b>' + MC.reactions.total() + '</b>。<br>手写不完，所以只手写「有名堂」的那部分，其余由种子确定性推导。');
    out += note('同一次调用、同一存档，结果<b>恒定</b>；可结果是什么，得跑了才知道。');
    out += h3('合成瞬时');
    out += note('表里每一项的 <code>sec</code> 都是 <b>0</b>。合成当场完成，' +
      '扣掉的是投进去的那两个元件本身。理由与账本见 <b>元件经济</b> 一页。');
    out += h3('有名堂的那些（' + MC.REACTIONS.length + ' 条）');
    out += table(['', '得什么', '由哪两个', '注脚'], MC.REACTIONS.map(function (r) {
      var a = MC.modules.byId(r.a), b = MC.modules.byId(r.b);
      var got = (r.out || []).map(function (id) { var m = MC.modules.byId(id); return m ? m.name : id; }).join('、') || '—';
      return row([
        { t: esc(a ? a.glyph : '·') + esc(b ? b.glyph : '·'), cls: 'g' },
        { t: esc(got), cls: 'nm' },
        { t: (a ? a.name : r.a) + ' ＋ ' + (b ? b.name : r.b), cls: 'd' },
        { t: esc(r.note), cls: 'd' }
      ]);
    }));
    out += h3('其余的怎么来');
    out += note('<b>同名基型</b> → 升一阶。这是高阶元件的主要来路。<br>' +
      '<b>留白</b>跟谁都反应，出来的还是留白——它是清空位，也是保底位。<br>' +
      '剩下的全按种子推导，分支有：单产出 / 双产出 / 出渣 / 落空 / 留白。' +
      '养成室的「杂」会把分支往更怪的方向推，「通谱」让你在投之前就看见结果。');
    return out;
  }

  function buildEnemies() {
    var out = note('名字一律用晦僻字。它是什么，由你在场上撞出来——' +
      '这里只给<b>字形、第几波起、体型与速度的相对量</b>，不给行为说明。');
    out += def('定义 E.0　四类',
      '场上的东西分四类：<b>常 / 精英 / 巨构 / 华丽</b>。<br>' +
      '四类在<b>出场权重、掉落份数、图鉴分组</b>上都分开算，所以它不是装饰——' +
      '它是你决定「这一只值不值得单独转身」时读的那一行。');
    out += grid(MC.CLASSES.map(function (c) {
      var n = MC.enemies.ofClass(c.id).length;
      return card({ glyph: c.id === 'mega' ? '▤' : (c.id === 'gaudy' ? '❦' : (c.id === 'elite' ? '➤' : '▲')),
        name: c.name, badge: n + ' 种', body: c.note });
    }));
    out += note('巨构与精英的出场权重比常类低一个数量级：' +
      '它们一多，场面就读不完了。但它们的掉落也分三份与两份——' +
      '难的那一截必须换得到东西，否则「挑软的打」永远是唯一正确的答案。');

    var maxHp = 150, maxSpd = 3.3;
    MC.CLASSES.forEach(function (c) {
      var list = MC.enemies.ofClass(c.id);
      if (!list.length) return;
      out += h3(c.name + '（' + list.length + ' 种）');
      out += table(['', '名', '出现', '厚 ┃ 快', '裸值'], list.map(function (e) {
        return row([
          { t: esc(e.glyph), cls: 'g' },
          { t: esc(e.name), cls: 'nm' },
          { t: '第 ' + e.min + ' 波', cls: 'd' },
          { t: bar(e.hp, maxHp) + bar(e.spd, maxSpd, true), cls: 'd' },
          { t: fmt(e.hp) + ' / ' + fmt(e.spd), cls: 'n' }
        ]);
      }));
    });
    out += note('上排是<b>厚</b>，下排是<b>快</b>；右边是第 1 波的裸值，实际要乘波次系数。');

    out += h3('曲线：更陡，且陡在后段');
    out += note('血量走 <code>1 + 0.16w + 0.0098w² + 0.00009w³</code>。' +
      '三次项只在后段发力，所以前十几波几乎不受影响——' +
      '「更陡」兑现成的是<b>后段真的追得上构筑</b>，不是前十波一起变厚。<br>' +
      '对照（陡度取中性）：第 10 波 ×' + fmt(MC.enemies.scaleOf(10, { steep: 1 })) +
      '　第 20 波 ×' + fmt(MC.enemies.scaleOf(20, { steep: 1 })) +
      '　第 30 波 ×' + fmt(MC.enemies.scaleOf(30, { steep: 1 })) +
      '　第 40 波 ×' + fmt(MC.enemies.scaleOf(40, { steep: 1 })) + '。');
    out += h3('局内成长随机化');
    out += note('开局先摇一份<b>脾气</b>：整条曲线的陡度（0.82 ~ 1.28）、' +
      '每一波再上下抖多少（0.10 ~ 0.30）、整体偏厚还是偏薄、偏快还是偏慢、' +
      '以及对四类各自偏爱多少。之后<b>每一波</b>再按这份脾气抖一次。<br>' +
      '所以同一个编号的第 20 波，这一局和上一局不是同一个数——' +
      '「这一局」这个概念在数值上才真的存在。<br>' +
      '但同编号同局数永远得到同一份：抖动走的是种子流，重开可复现。<br>' +
      '脾气摊在主舞台的「这一局的脾气」那一格上，是看得见的；' +
      '看不见的随机不该存在，那和旧版那些看不见的百分比堆叠是一回事。');
    out += h3('形状');
    out += note('边数与内构由它是哪一种决定：三边、四边、五边……各不相同。' +
      '形状告诉你它是哪一类，不写字。');
    out += h3('眠：一次性');
    out += note('「眠」在远处盯着你，进入 ' + fmt(210) + ' 像素内开始蓄力（' + fmt(46) +
      ' 帧，外环可见地收），然后<b>冲一次</b>——2.6 倍速，撞完就力竭，' +
      '之后只剩原来 ' + fmt(0.35) + ' 的速度。<br>' +
      '旧版每 80 帧重新蓄一次力、冲速还叠 1.9 倍。那不是敌人，那是节拍器：' +
      '你走位躲不开它，因为它的节奏与你的位置无关。<br>' +
      '现在它一辈子只冲一次，所以它可以被<b>绕开</b>、被<b>引开</b>，' +
      '也可以被你当成一次性资源用掉。');
    return out;
  }

  function buildPhases() {
    var out = def('定义 PH.1　波相',
      '波相按波次依次开，<b>一共 ' + MC.PHASES.length + ' 条，条数封顶</b>。' +
      '开的越多场面越挤，但你始终知道现在有哪几条在生效。');
    out += note('这一层整体替换了旧版的「变异」。' +
      '旧版每 5 波叠一条永久变异，十条叠满之后哪张表都说不出场上正在发生什么——' +
      '那正是它体验不好的根因：<b>规则多到读不完</b>。<br>' +
      '现在上限 ' + MC.PHASES.length + ' 条，全部摊在总台上，' +
      '养成室的「望」还能让你提前看到下一条。');
    out += grid(MC.PHASES.map(function (p) {
      return card({
        glyph: p.glyph, name: p.name, badge: '第 ' + p.wave + ' 波',
        kv: 'w ' + p.w, body: p.note
      });
    }));
    out += h3('数值随波次怎么走');
    out += table(['波次', '已开波相', '出怪数 ×', '血量 ×', '精化率', 'Boss 间隔'], [3, 5, 13, 20, 30, 40, 50].map(function (w) {
      var pm = MC.waves.phaseMods(w);
      return row([
        { t: '第 ' + w + ' 波', cls: 'nm' },
        { t: MC.waves.activePhases(w).map(function (p) { return p.name; }).join(' ') || '—', cls: 'd' },
        { t: '×' + fmt(pm.spawnMul), cls: 'n' },
        { t: '×' + fmt(pm.hpMul), cls: 'n' },
        { t: pct(pm.eliteChance), cls: 'n' },
        { t: pm.bossEvery + ' 波', cls: 'n' }
      ]);
    }));
    return out;
  }

  function buildElites() {
    var out = def('定义 EL.1　精化',
      '精化不是新机制，是给某一只东西挂一个<b>看得见</b>的徽记：外圈加一个字。');
    out += note('这一层同样替换了旧版的「变体」。旧版变体是看不见的百分比堆叠——' +
      '你只知道「这一只不太一样」，至于是哪里不一样得猜。' +
      '看得见才可以针对；看不见的堆叠只会把场上搅成一团读不下去。');
    out += grid(MC.ELITES.map(function (e) {
      return card({ glyph: e.glyph, name: e.name, body: e.note });
    }));
    out += h3('概率');
    out += note('底子 ' + pct(MC.waves.phaseMods(0).eliteChance) +
      '，波相「盛」把它抬到 ' + pct(MC.waves.phaseMods(50).eliteChance) +
      '，养成室还能再加。<b>封顶 ' + pct(0.45) + '</b>——' +
      '所以场上大多数时候仍然是普通的那一只。' +
      '精化与镜像都掉双份，「这一只不一样」必须能被兑现。');
    out += note('「灼」死的时候炸一下，所以它死得慢一点，你有时间走开。' +
      '「孖」死后分成两只小的。');
    return out;
  }

  function buildAnomaly() {
    var out = h3('织构　开局抽两缕，挂满整局');
    out += grid(MC.ANOMALY.WEAVE.map(function (w) {
      return card({ glyph: w.glyph, name: w.name, badge: 'w ' + w.w, body: w.note });
    }));
    out += h3('当波事件　每波抽一条，也可能抽不到');
    out += grid(MC.ANOMALY.EVENTS.map(function (e) {
      return card({
        glyph: e.glyph, name: e.name, badge: '第 ' + (e.min || 3) + ' 波起',
        body: e.note + (e.spawn ? '（改时刻表：' + ({ bunch: '一起涌上来', sparse: '撒得极稀', fast: '出得极快' })[e.spawn] + '）' : '')
      });
    }));
    out += note('抽不到也是一条结果。风格「静」把这一层整条按掉——' +
      '它写在 <code>waveEvent()</code> 调用之前，所以事件表不用知道自己有风格这回事。');
    out += h3('已删除的两张表');
    out += note('旧版这里还有第四张表 <code>ROLLS</code>（掉几个 / 成色多高 / 掉一把渣），' +
      '以及 <code>VARIANTS</code>（看不见的敌人变体）。两张都已删除，' +
      '前者并进合成结果，后者由<b>精化</b>接管。<br>' +
      '波次事件与织构都还在：它们是「这一局的形状」，与「这一波撞上什么」分开。');
    out += h3('为什么这些都要摊在明面上');
    out += note('抽到什么必须<b>可复现</b>：同编号 + 同局数 = 同一张织构，等价于同一局。' +
      '换编号 = 换一整套；重开一局 = 织构重抽，但抽法还是那一种——' +
      '抽法是规则，抽到什么是结果。');
    return out;
  }

  function buildLadder() {
    var out = note('累计击杀跨过门槛，<b>场上</b>换一条规则。八级里有四级是压力，不是奖励——' +
      '数量级上去以后，世界也会变。');
    out += grid(MC.LADDER.map(function (l) {
      return card({
        glyph: l.glyph, name: l.name, badge: '第 ' + l.tier + ' 级',
        kv: '门槛 ' + MC.ladder.fmt(MC.ladder.atOf(l.tier)) + ' 累计击杀',
        body: l.note, bar: Math.log10(l.at + 1), barMax: Math.log10(250001), red: !l.good
      });
    }));
    out += h3('门槛是可走到的');
    out += note('一局几百到几千杀，攒几十局能摸到后面几级。养成室的「近」把所有门槛整体乘 ' +
      '<b>0.8</b>——走的是乘法，不是减法。');
    return out;
  }

  function buildEpoch() {
    var out = def('定义 EP.1　纪元',
      '阶跃改的是「场上会发生什么」，<b>纪元改的是「数字本身怎么长」</b>。');
    out += note('阶跃跨过门槛，世界换一条规则；纪元跨过门槛，<b>尺子换一把</b>。' +
      '所以旧存档里的「伤害 40」到了新纪元不再等于旧纪元的「伤害 40」——' +
      '数量级上去以后，原来那个数就不再是原来那个意思。<br>' +
      '这是「量变走到头就成质变」这句话在代码里的落点：' +
      '纪元不改任何一条规则，它改的是「规则里的数怎么算」。');
    out += grid(MC.EPOCHS.map(function (e, i) {
      return card({
        glyph: e.glyph, name: e.name, badge: '第 ' + i + ' 纪元',
        kv: '门槛 ' + MC.ladder.fmt(MC.epoch.atOf(i)) + ' 累计击杀' +
          (i > 0 ? '　·　律 ' + lawText(e.laws) : ''),
        body: e.note,
        bar: Math.log10(e.at + 1), barMax: Math.log10(5000001), red: !e.good
      });
    }));
    out += h3('律的七个键');
    out += note('全部是乘算，<code>1</code> 表示不改。引擎只读这张表，不认 id：');
    out += table(['键', '改的是', '怎么改'], MC.LAW_KEYS.map(function (k) {
      return row([
        { t: '<code>' + k + '</code>', cls: 'nm' },
        { t: LAW_LABEL[k] || k, cls: 'd' },
        k === 'edge'
          ? { t: '收边强度。0 = 场地不收，1 = 照常收，>1 = 收得更狠', cls: 'd' }
          : { t: '这个系数乘在原有的波次项上', cls: 'd' }
      ]);
    }));
    out += h3('律随纪元相乘');
    out += table(['纪元', '血量坡度', '掉落', '开火', '残渣', 'Boss', '一波时长', '收边'],
      MC.EPOCHS.map(function (e, i) {
        var L = MC.epoch.laws(MC.epoch.atOf(i));
        return row([
          { t: e.name, cls: 'nm' },
          { t: '×' + fmt(L.hpWave), cls: 'n' },
          { t: '×' + fmt(L.dropWave), cls: 'n' },
          { t: '×' + fmt(L.rateWave), cls: 'n' },
          { t: '×' + fmt(L.resWave), cls: 'n' },
          { t: '×' + fmt(L.bossWave), cls: 'n' },
          { t: '×' + fmt(L.waveGain), cls: 'n' },
          { t: '×' + fmt(L.edge), cls: 'n' }
        ]);
      }));
    out += h3('养成室能改律');
    out += note('「早律」把门槛整体压低；「厚尺」「缓坡」把血量的二次项放缓；' +
      '「留量」把残渣加成再抬；「双纪」三样一起放宽。' +
      '所以纪元不是纯线性地越来越难——它是<b>可以被改写的</b>。');
    return out;
  }

  /* Boss：旧版六个 Boss 只是「零件数不一样」，打起来是同一场戏。
     现在每一只另有一套出手，这里把它摊出来。 */
  function buildBosses() {
    var out = def('定义 BS.1　Boss',
      '多部件、先破件再打芯。位置是场上唯一的<b>「必须瞄」</b>目标。');
    out += note('破一件，出手就快一分——这是「先破件」唯一的即时回报。' +
      '全破了之后它才真的开始：那一段是这一场真正要你走位的部分。');
    out += table(['', 'Boss', '部件', '血量', '出手', '注脚'], MC.BOSSES.map(function (b) {
      var AI = { ring: '一圈圈往外放', spiral: '一条一直转的螺旋', beam: '朝你划一条线',
        summon: '一直吐小的', cross: '四条正交的线', sweep: '横着扫过全场' };
      return row([
        { t: esc(b.glyph), cls: 'g' },
        { t: esc(b.name), cls: 'nm' },
        { t: b.parts + ' 件', cls: 'n' },
        { t: fmt(b.hp), cls: 'n' },
        { t: AI[b.ai] || b.ai, cls: 'd' },
        { t: esc(b.note || ''), cls: 'd' }
      ]);
    }));
    return out;
  }

  function buildCosmetics() {
    var out = def('定义 SK.1　皮肤',
      '皮肤<b>只改颜色</b>。判定逐字相同——换皮不影响任何一条规则。');
    out += note('所以皮肤表里不许出现任何参与判定的字段。' +
      '写了就是 bug：那张表会被 <code>applySkin()</code> 整个铺到 CSS 变量上，' +
      '多一个键就多一处「看起来像设置、其实是规则」的东西。');
    out += h3('皮肤（' + MC.SKINS.length + ' 套）');
    out += grid(MC.SKINS.map(function (s) {
      var sw = ['bg', 'panel', 'acc', 'acc2', 'ballistic', 'chassis', 'rule', 'rare']
        .map(function (k) {
          return '<i style="display:inline-block;width:15px;height:9px;margin-right:3px;' +
            'border:1px solid var(--line2);background:' + s.ui[k] + '"></i>';
        }).join('');
      return card({ glyph: s.glyph, name: s.name, kv: sw, body: s.note });
    }));
    out += def('定义 ST.1　风格',
      '风格<b>改规则</b>。每一项都是一组乘算，写在 <code>styleMods</code> 里，' +
      '由引擎在 <code>recalcRule()</code> 与 <code>applyRig()</code> 两处收口。');
    out += note('风格改的是「这一局的形状」，不是「这一局的难度上限」。' +
      '难度上限归 <code>MC.eff</code>，风格只乘在上面。' +
      '皮肤与风格<b>正交</b>：任何皮肤都能配任何风格。');
    out += h3('风格（' + MC.STYLES.length + ' 种）');
    out += grid(MC.STYLES.map(function (s) {
      var kv = Object.keys(s.mods || {}).map(function (k) {
        return k === 'quiet' ? '不抽当波事件' : ((STYLE_LABEL[k] || k) + ' ×' + s.mods[k]);
      }).join('　');
      return card({ glyph: s.glyph, name: s.name, kv: kv || '一条规则都不改', body: s.note });
    }));
    out += h3('另外三个开关');
    out += note('<b>画面特效</b>：震屏与闪白。关掉它不影响任何判定。<br>' +
      '<b>显示敌方血条</b>：每一只头上那一条。关掉它场上更干净。<br>' +
      '<b>瞄准</b>：默认手动；「锁最近」把方向换回自动选敌。');
    out += note('这一页本身同时也是一块皮肤预览：右上角切到夜间，整份说明连同表格一起换色。');
    return out;
  }

  function buildNumbers() {
    var out = h3('成长公式');
    out += table(['什么', '公式', '第 10 波', '第 30 波', '第 60 波'], [
      row([{ t: '敌人血量系数', cls: 'nm' }, '<code>1 + 0.19w + 0.012w²</code>',
        { t: fmt(MC.enemies.scaleOf(10)) + '×', cls: 'n' }, { t: fmt(MC.enemies.scaleOf(30)) + '×', cls: 'n' }, { t: fmt(MC.enemies.scaleOf(60)) + '×', cls: 'n' }]),
      row([{ t: 'Boss 血量系数', cls: 'nm' }, '<code>1 + 0.14w + 0.02w²</code>',
        { t: fmt(MC.waves.bossScale(10)) + '×', cls: 'n' }, { t: fmt(MC.waves.bossScale(30)) + '×', cls: 'n' }, { t: fmt(MC.waves.bossScale(60)) + '×', cls: 'n' }]),
      row([{ t: '一波出多少', cls: 'nm' }, '<code>min(70, 5 + 1.9w)</code>',
        { t: fmt(5 + 19), cls: 'n' }, { t: fmt(5 + 57), cls: 'n' }, { t: '70', cls: 'n' }]),
      row([{ t: '等级缩放', cls: 'nm' }, '<code>1 + 0.6×(lv−1)</code>', 'Ⅰ 1.0', 'Ⅱ 1.6', 'Ⅲ 2.2']),
      row([{ t: '协同强度', cls: 'nm' }, '<code>1 + 0.45×(均级−1)</code>', 'Ⅰ 1.0', 'Ⅱ 1.45', 'Ⅲ 1.9']),
      row([{ t: '残渣结算', cls: 'nm' }, '<code>⌊kills/40⌋ + wave×2</code>', '—', '—', '—'])
    ]);
    out += h3('不受任何成长影响的三个数');
    out += table(['量', '值', '为什么它是硬的'], [
      row(['受击冷却', { t: '60 帧 = 1 秒', cls: 'nm' }, { t: '判定规则，不是可调数值。养成全满也还是一秒。', cls: 'd' }]),
      row(['判定点基准', { t: fmt(4.5) + ' px', cls: 'nm' }, { t: '与可见体积分开。养成改得动它，但改不成 0。', cls: 'd' }]),
      row(['掉落基础率', { t: '0.11', cls: 'nm' }, { t: '往下只被四层乘算抬，不被任何东西跳过。', cls: 'd' }])
    ]);
    out += h3('随机的三条流');
    out += note('<b>判定流</b>：暴击、掉落、再生、镜像、精化、闪避。每次开局重播。<br>' +
      '<b>视觉流</b>：震屏偏移。单独走，所以暂停时只画不推进也不会把判定带偏。<br>' +
      '<b>AI 流</b>：每个敌人自己那一支。');
    out += h3('终止守卫');
    out += note('波次调度、连锁、分裂、吞噬、弹丸、区域、光束、几何障，全部有计数上限或帧上限。' +
      '无上限的递归不进代码。');
    return out;
  }

  function buildHonest() {
    return h3('已知限制') +
      note('·　养成室的孵化靠<b>挂钟时间</b>。改系统时间会让它跳。<br>' +
        '·　存档在浏览器本地（<code>localStorage</code>）。换浏览器、清缓存，进度就换一份。<br>' +
        '·　<code>file://</code> 下 iframe 可能被挡，房间会退化成「独立打开」，存档与主舞台仍是同一份。<br>' +
        '·　本说明的数据由同一份声明表渲染，表改了它就改；它不维护第二份数据。<br>' +
        '·　无头测试守的是<b>运行时错误与数值不变式</b>，不是像素。画得好不好看，得你自己开一眼。') +
      h3('这一版删掉了什么') +
      note('·　<b>变异</b>（每 5 波一条永久规则）与<b>变体</b>（看不见的敌人百分比堆叠）：' +
        '整体删除，换成 ' + MC.PHASES.length + ' 条封顶的<b>波相</b>与看得见的<b>精化</b>。<br>' +
        '·　<b>掉落方差表</b>（掉几个 / 成色多高 / 掉一把渣）：删除，掉落现在只出一件。<br>' +
        '·　<b>培养皿的挂钟等待</b>：删除，合成瞬时，代价改为两个元件。') +
      h3('这一版加了什么') +
      note('·　<b>判定点</b>与<b>一秒受击冷却</b>：判定走点不走面，冷却不随成长变化。<br>' +
        '·　<b>手动瞄准</b>：键盘移动，鼠标定向；另备「锁最近」。<br>' +
        '·　<b>蓄能</b>：击杀与伤害都在攒，满槽放一次净化；净化与清空一波各回一口气。<br>' +
        '·　<b>元件十级</b>：等级上限从三级提到十级，稀有基型给满；掉落衰减放缓，高等级真的掉得出来。<br>' +
        '·　<b>局内生效</b>：装配台改的任何一项当场写进身体——上限涨多少，血就当场加多少。<br>' +
        '·　<b>流派</b>：' + MC.STYLES.length + ' 种游戏风格单开一间——它改的是规则（出场数、血量、掉落、速度），' +
        '是角色玩法，不是外观，所以不再和皮肤并排摆在设置里。<br>' +
        '·　<b>设置</b>：' + MC.SKINS.length + ' 套皮肤、操作与无障碍开关。<br>' +
        '·　<b>纪元</b>：' + MC.EPOCHS.length + ' 把尺子，改的是数字怎么长。<br>' +
        '·　养成节点 <b>' + MC.NURSERY.length + '</b> 个，分支 <b>' + MC.BRANCHES.length + '</b> 支。') +
      h3('测试守什么') +
      note('无头测试守三件新的事：' +
        '合成真的扣元件（<code>invTake</code> 扣不动时返回 false）、' +
        '一秒内第二下真的进不来、眠一辈子只冲一次。' +
        '外加判定点比可见体积小、方向只来自鼠标、旧的四张表确实已经从 API 上摘掉。') +
      h3('安全出口') +
      '<div class="warnbox"><b>光敏提醒　</b>受击只做一次短闪，不做周期闪烁、全屏反相、突然强光。' +
      '若你对闪烁敏感，请打开<b>冷静模式</b>：它压住数量与速度的上限，并把震屏关掉。</div>' +
      '<div class="warnbox"><b>声轨　</b>默认静音，需要你先点一下才出声。它不进任何判定，也不写进卷宗——' +
      '它另行记账。</div>' +
      '<div class="warnbox"><b>判定说明　</b>受击冷却是 1 秒固定值，判定点是 ' + fmt(4.5) +
      ' 像素起算。这两条写在表里，是因为它们<b>不该被成长改掉</b>——' +
      '它们属于「怎么读懂一次死亡」，属于规则那一侧，不属于「变强」那一边。</div>' +
      h3('勘误') +
      err('注 1（概念增加 1）',
        '「随机不是把数字搅乱」这一条漏了一层：随机同时也是对于「抽法」与「抽到什么」的区分。' +
        '本作的表改的是抽法，不是结果。') +
      err('注 2（概念增加 2）',
        '织构在开局抽，事件在每波抽，波相按波次开。加表项时不用管入口，改入口时得同时看这几处。') +
      err('注 3（原定义修正声明，不改编号）',
        '「所有数值钳制走 MC.eff」不适用于织构、事件与波相——那三张表的键是动态的，' +
        '钳制在 <code>recalcRule()</code> 里。') +
      err('注 4（这一版新增）',
        '「元件是局内资源」这一条与旧版 README 的「元件库存 [局外]」直接冲突。' +
        '冲突时以本条为准：<code>bus.blank()</code> 里的 <code>inventory</code> ' +
        '属于<b>局内</b>，局末与硬重置都会清它；<code>found</code> 才是局外。');
  }

  /* ---- 字·毁：一页纯文字。它是本作的一部分，不是装饰 ---- */
  var ART = [
    '炉 子 是 热 的',
    '',
    '进 去 两 个　　出 来 一 个',
    '进 去 两 个　　出 来 三 个',
    '进 去 两 个　　出 来 零 个',
    '',
    '两 个 都 没 了',
    '这 一 炉 才 叫 合 成',
    '',
    '————**————',
    '',
    '第 一 千 次 开 炉',
    '第 一 千 次 开 炉',
    '第 一 千 次 开 炉',
    '',
    '-0.0000000000000000001',
    '，，，，，',
    '',
    '它 长 成 了 第 三 个 样 子',
    '',
    '你 在 数 第 几 只',
    '你 在 数 第 几 只',
    '',
    '、　、　、　、　、',
    '',
    '规 则 只 有 三 条',
    '结 果 有 九 百 九 十 种',
    '',
    '————**————',
    '',
    '秒 针 走 满 一 圈',
    '之 间 什 么 都 进 不 来',
    '',
    '中 心 那 一 点',
    '才 是 你',
    '',
    '空 位 也 是 一 位',
    '空 配 空　还 是 空',
    '',
    '说 白 了',
    '你 只 是 在 挪',
    '打 的 是 它',
    '',
    '-99999999999999999999',
    '',
    '这 一 点 到 为 止',
    '',
    '尺 子 换 了 一 把',
    '旧 的 数 字 还 在',
    '它 已 经 不 再 表 示 那 件 事',
    '',
    '　　　　◇',
    '',
    '　　　规 则 自 己 跑',
    '　　　结 果 自 己 长'
  ];

  function buildArt() {
    var html = ART.map(function (l) {
      var c = 'q';
      if (/^-?\d/.test(l) || /[，、]/.test(l)) c = 'z';
      return '<span class="' + c + '">' + esc(l || ' ') + '</span>';
    }).join('\n');
    return note('这一页是<b>毁灭性文字艺术</b>：短行、无标点、数字作噪点、重复与留白。' +
      '它不解释任何机制，它是机制留下的回声。') +
      '<div class="art">' + html + '</div>' +
      note('按需自取。');
  }

  /* ======================= 声明表 ======================= */
  var PAGES = [
    { id: 'overview', grp: '起手', name: '概览', build: buildOverview },
    { id: 'mechanics', grp: '起手', name: '机制', build: buildMechanics },
    { id: 'economy', grp: '起手', name: '元件经济', build: buildEconomy },
    { id: 'modules', grp: '装配', name: '元件', build: buildModules },
    { id: 'synergy', grp: '装配', name: '协同', build: buildSynergy },
    { id: 'reactions', grp: '装配', name: '培养皿', build: buildReactions },
    { id: 'nursery', grp: '装配', name: '养成', build: buildNursery },
    { id: 'enemies', grp: '场上', name: '敌人', build: buildEnemies },
    { id: 'bosses', grp: '场上', name: 'Boss', build: buildBosses },
    { id: 'phases', grp: '场上', name: '波相', build: buildPhases },
    { id: 'elites', grp: '场上', name: '精化', build: buildElites },
    { id: 'anomaly', grp: '场上', name: '织构与事件', build: buildAnomaly },
    { id: 'ladder', grp: '场上', name: '阶跃', build: buildLadder },
    { id: 'epoch', grp: '场上', name: '纪元与律', build: buildEpoch },
    { id: 'cosmetics', grp: '设置', name: '皮肤与风格', build: buildCosmetics },
    { id: 'numbers', grp: '底', name: '数值', build: buildNumbers },
    { id: 'honest', grp: '底', name: '老实交代', build: buildHonest },
    { id: 'art', grp: '底', name: '字 · 毁', build: buildArt }
  ];

  /* ---- 搜索索引：渲染出来的一切都进这里，所以搜索也是声明式的 ---- */
  var INDEX = [];
  function indexPage(p, text) {
    var plain = String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    INDEX.push({ id: p.id, name: p.name, text: plain.toLowerCase() });
  }

  /* ======================= 路由与渲染 ======================= */
  var cur = 'overview';

  function routeFromHash() {
    var m = /p=([a-z]+)/.exec(location.hash || '');
    if (m && PAGES.some(function (p) { return p.id === m[1]; })) return m[1];
    return 'overview';
  }

  function renderNav() {
    var html = '', lastGrp = null;
    PAGES.forEach(function (p) {
      if (p.grp !== lastGrp) { html += '<div class="grp">' + esc(p.grp) + '</div>'; lastGrp = p.grp; }
      html += '<a href="#p=' + p.id + '" data-p="' + p.id + '"' + (p.id === cur ? ' class="on"' : '') + '>' + esc(p.name) + '</a>';
    });
    $('nav').innerHTML = html;
  }

  function render() {
    var p = PAGES.filter(function (x) { return x.id === cur; })[0];
    if (!p) return;
    var body = p.build();
    indexPage(p, body);
    $('main').innerHTML = '<h2 class="pg">' + esc(p.name) + '</h2>' + body;
    renderNav();
    document.title = '微宇宙 · 内置说明 · ' + p.name;
    if (location.hash.indexOf('p=' + p.id) < 0) location.hash = 'p=' + p.id;
  }

  function go(id) { cur = id; render(); window.scrollTo(0, 0); }

  /* ---- 搜索：扫渲染后的正文，不扫源码 ---- */
  function search(q) {
    q = String(q || '').trim().toLowerCase();
    var box = $('res');
    if (!q) { box.innerHTML = ''; $('main').style.display = ''; return; }
    /* 没有渲染过的页面先渲染一遍，索引才全 */
    PAGES.forEach(function (p) {
      if (INDEX.some(function (i) { return i.id === p.id; })) return;
      indexPage(p, p.build());
    });
    var hits = INDEX.filter(function (i) { return i.text.indexOf(q) >= 0; });
    $('main').style.display = 'none';
    if (!hits.length) { box.innerHTML = '<div class="empty">册子上没有这个词。换个说法试试。</div>'; return; }
    box.innerHTML = '<h3>搜「' + esc(q) + '」　' + hits.length + ' 处</h3>' +
      hits.map(function (i) {
        var at = i.text.indexOf(q);
        var frag = i.text.slice(Math.max(0, at - 30), at + 60);
        return '<div class="card"><div class="hd"><span class="nm">' + esc(i.name) + '</span></div>' +
          '<div class="bd">…' + esc(frag) + '…</div></div>';
      }).join('<div style="height:6px"></div>');
  }

  /* ---- 主题：默认浅色（与阅读环境一致），右上角可手动切到夜间 ---- */
  function effectiveTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }
  function applyTheme(t) {
    if (t) document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    var dark = effectiveTheme() === 'dark';
    $('theme').textContent = dark ? '◐ 日间' : '◐ 夜间';
    $('theme').className = dark ? 'on' : '';
  }

  /* ======================= 启动 ======================= */
  MC.bus.load();
  cur = routeFromHash();

  renderNav();
  render();

  window.addEventListener('hashchange', function () {
    var id = routeFromHash();
    if (id !== cur) { cur = id; $('main').style.display = ''; $('q').value = ''; $('res').innerHTML = ''; render(); }
  });
  $('nav').addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[data-p]') : null;
    if (!a) return;
    go(a.getAttribute('data-p'));
    $('main').style.display = ''; $('q').value = ''; $('res').innerHTML = '';
  });

  var timer = 0;
  $('q').addEventListener('input', function () {
    clearTimeout(timer);
    var v = this.value;
    timer = setTimeout(function () { search(v); }, 120);
  });
  $('theme').onclick = function () {
    var now = document.documentElement.getAttribute('data-theme');
    if (!now) now = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    applyTheme(now === 'dark' ? 'light' : 'dark');
  };
  applyTheme('');

  $('foot').innerHTML =
    '微宇宙 · 内置说明　·　数据由同一份声明表渲染，不维护第二份　·　' +
    MC.MODULES.length + ' 元件　' + MC.ENEMIES.length + ' 敌人　' +
    MC.SYNERGY.length + ' 协同　' + MC.reactions.total() + ' 组合　' +
    MC.NURSERY.length + ' 养成节点　' + MC.PHASES.length + ' 波相　' +
    MC.ELITES.length + ' 精化　' + MC.EPOCHS.length + ' 纪元　' +
    MC.SKINS.length + ' 皮肤　' + MC.STYLES.length + ' 风格' +
    '<br>离线可用。回<a href="../index.html">主舞台</a>。';
})();
