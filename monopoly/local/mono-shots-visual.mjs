import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

/*
 * M13 画面重设计 · 手机视口截图（硬性口径 390×844 @dpr2，spec §11.3）
 *
 * 产出并入库 `docs/verify/`：
 *   mono-visual-01a..01e-<palette>.png  五套配色各一张全屏
 *   mono-visual-02-labels.png           棋盘区放大（楼顶名牌可读性核对）
 *   mono-visual-03-hud.png              底坞特写（1 条 4 段资产条 + 骰面 + 主按钮）
 *   mono-visual-04-tilecard.png         落地态地块卡滑入
 *   mono-visual-05-street.png           中部街市带 + 事件浮层
 *   mono-visual-06-drawer.png           牌袋抽屉打开
 *   mono-visual-07-catalog.png          素材库总览（6 原型 + 16 道具 + 7 环境层）
 *   mono-visual-08-console.png          风格控制台（逐栋选色 + 导出）
 *   mono-visual-09-players.png          Q 版人物四造型 + 三表情 + 停留气泡
 *
 * MONO_ORIGIN 默认本地 dev（`npm run dev` 起在 52300）；Task 12 线上回归时
 * 用 `$env:MONO_ORIGIN="https://game.joho.cn/tour"` 复跑，覆盖为线上实拍。
 */

const ORIGIN = process.env.MONO_ORIGIN || 'http://127.0.0.1:52300';
const OUT = 'docs/verify';
mkdirSync(OUT, { recursive: true });

const PALETTES = ['warm-market', 'snow-deer', 'papercut', 'onsen-mist', 'night-neon'];
const LETTER = ['a', 'b', 'c', 'd', 'e'];

/** 素材库总览用的三组清单（与 tools/registry-ids.json / theme.json 一致） */
const PROTOS = [
  ['building.s0.l1', 'stall'],
  ['building.s0.l2', 'shop'],
  ['building.s1.l3', 'market3'],
  ['building.s4.l2', 'onsenHouse'],
  ['building.s13.l2', 'gate'],
  ['building.s0.l3', 'barn'],
];
const PROPS = [
  'prop.awning', 'prop.lantern', 'prop.banner', 'prop.rooftopBox', 'prop.signTower', 'prop.antenna',
  'prop.tree', 'prop.lamp', 'prop.flagpole', 'prop.chimney', 'prop.barrel', 'prop.lionStone',
  'prop.snowPile', 'prop.clothesline', 'prop.steamVent', 'prop.stoneLantern',
];
const BGS = ['bg.sky', 'bg.stars', 'bg.moon', 'bg.ridge', 'bg.street', 'bg.lanternString', 'bg.streetLamp'];

const browser = await chromium.launch();
const errors = [];
const facts = {};
const files = [];

const attach = (p) => {
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
};
/** 手机视口：390×844；dpr 可放大（局部特写用 3 ⇒ 同一切图就是 3 倍放大） */
const phone = async (dpr = 2) => {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: dpr });
  attach(p);
  return p;
};
const open = async (p, query, needGame = true) => {
  await p.goto(`${ORIGIN}/mono.html?${query}`, { waitUntil: 'networkidle' });
  await p.waitForFunction((g) => Boolean(window.__monoMain) && (!g || Boolean(window.__monoMain.game)), needGame, { timeout: 20000 });
};
const shot = async (p, name, opts = {}) => {
  const path = `${OUT}/mono-visual-${name}.png`;
  await p.screenshot({ path, ...opts });
  files.push(path);
};

/* —— 01：五套配色各一张全屏（`?theme=<paletteId>` 整体强制套色） —— */
{
  const p = await phone();
  facts.palettes = {};
  for (let i = 0; i < PALETTES.length; i++) {
    const id = PALETTES[i];
    await open(p, `play=1&seed=20260928&humans=4&tour=0&nofx=1&theme=${id}`);
    facts.palettes[id] = await p.evaluate(() => {
      const inst = window.__monoMain.scene.instancesOf();
      const wall = (x) => inst.find((x2) => x2.id === x)?.provider?.params?.wallL ?? null;
      return { s4l2: wall('building.s4.l2'), s1l1: wall('building.s1.l1') };
    });
    await shot(p, `01${LETTER[i]}-${id}`);
  }
  await p.close();
}

/* —— 02 / 03 / 04 / 05 / 06：同一局 play（dpr3 ⇒ 切图自带 3 倍放大） —— */
{
  const p = await phone(3);
  await open(p, 'play=1&seed=20260928&humans=4&tour=0&nofx=1');

  /* 先掷一次骰：`state.dice` 只在「已掷未动」之间保留，回合结束即清空 —— 底坞特写要看得见点数 */
  facts.dice = await p.evaluate(() => {
    const m = window.__monoMain;
    const r = m.game.rollDice();
    m.paint();
    return { d1: r.d1, d2: r.d2 };
  });

  /* 02 棋盘区放大（含楼顶名牌与当前格金环） */
  await shot(p, '02-labels', { clip: { x: 0, y: 58, width: 390, height: 282 } });

  /* 03 底坞特写（4 段资产条 + 骰面点数 + 主按钮） */
  await shot(p, '03-hud', { clip: { x: 0, y: 596, width: 390, height: 248 } });

  /* 把这一掷走完（移动 → 结算 → 交人），回到 idle 再摆 04 的局面 */
  facts.rollTo = await p.evaluate(() => {
    const m = window.__monoMain;
    m.game.moveCurrent();
    m.game.settleCurrent();
    m.game.endTurn();
    m.paint();
    return { phase: m.game.state.phase };
  });

  /* 04 落地地块卡（停无主 shop ⇒ `settled` 滑入卡） */
  facts.tileCard = await p.evaluate(() => {
    const m = window.__monoMain;
    const s = m.game.state;
    const slot = m.scene.instancesOf().find((i) => i.id === 'board.tile.shop' && i.slot !== null).slot;
    const pl = s.players[s.current];
    s.over = false;
    s.estates = {};
    s.estates[slot] = { index: slot, owner: pl.id, level: 1, processing: false };
    pl.cash = Math.max(pl.cash, 5000);
    pl.pos = slot;
    s.phase = 'settled';
    m.paint();
    const card = m.scene.instancesOf().find((i) => i.id === 'ui.tileCard');
    return { cards: m.scene.instancesOf().filter((i) => i.id === 'ui.tileCard').length, title: card?.state?.title ?? null };
  });
  await shot(p, '04-tilecard');

  /* 05 中部街市带 + 事件浮层（落命运格 → 卡面浮层） */
  facts.street = await p.evaluate(() => {
    const m = window.__monoMain;
    const s = m.game.state;
    const slot = m.scene.instancesOf().find((i) => i.id === 'board.tile.fate' && i.slot !== null).slot;
    if (s.phase !== 'idle') m.game.endTurn();   // 04 步把局面留在了 settled：先收尾回 idle 才能掷骰
    const pl = s.players[s.current];
    s.over = false;
    s.estates = {};
    pl.cash = 5000;
    const r = m.game.rollDice();
    pl.pos = ((slot - r.total) % 32 + 32) % 32;
    m.game.moveCurrent();
    const settle = m.game.settleCurrent();
    m.paint();
    return { settleKind: settle.kind, overlay: m.scene.instancesOf().filter((i) => i.id === 'ui.card').length };
  });
  await p.waitForTimeout(120);
  await shot(p, '05-street');

  /* 06 牌袋抽屉打开（5 槽入画，牌袋键文案翻为「收起手牌」） */
  await p.evaluate(() => {
    document.querySelector('#mono-panels button[data-action="card:close"]')?.click();
    document.querySelector('#mono-hud button[data-action="hand"]')?.click();
  });
  await p.waitForTimeout(120);
  facts.drawer = await p.evaluate(() => ({
    slots: window.__monoMain.scene.instancesOf().filter((i) => i.id === 'ui.handSlot').length,
    keys: document.querySelectorAll('#mono-hud button[data-action="hand"]').length,
  }));
  await shot(p, '06-drawer');
  await p.close();
}

/* —— 07：素材库总览（合成版式：`buildOne` 逐件出图 + DOM 小标题） ——
   `bg.*` 一族是满屏背景层（provider 取 `box.w/h`，不吃 `s`），塞进小格会互相压掉，
   故拆成两张：07 = 6 原型 + 16 道具；07b = 7 环境层按原台位叠加的实景条带。 */
{
  const p = await phone(3);
  await open(p, 'demo=1&nofx=1&tour=0', false);
  await p.addStyleTag({ content: '#mono-share{display:none}' });
  facts.catalog = await p.evaluate(([protos, props]) => {
    const m = window.__monoMain;
    m.scene.reset();
    m.scene.render();
    const fx = m.stage.layers.fxUi;
    const cap = (text, x, y, size = '9px', color = '#9fb3a8') => {
      const d = document.createElement('div');
      d.textContent = text;
      d.style.cssText = `position:fixed;left:${x}px;top:${y}px;transform:translateX(-50%);width:max-content;`
        + `font:${size} ui-monospace,monospace;color:${color};pointer-events:none;text-align:center`;
      document.body.appendChild(d);
    };
    const put = (id, cx, cy, s) => {
      const c = m.scene.buildOne({ id, c: 0, r: 0, pass: 4, fixed: { cx, cy, s } });
      fx.addChild(c);
      return c.children.length > 0;
    };
    /* 原型：3 列 × 2 行 */
    cap('原型 · 6', 195, 24, '11px', '#f5c451');
    const protoOk = protos.map(([id, name], i) => {
      const cx = 70 + (i % 3) * 125;
      const cy = 118 + Math.floor(i / 3) * 118;
      cap(name, cx, cy - 52, '9px', '#f5c451');
      return put(id, cx, cy, 0.5);
    });
    /* 道具：4 列 × 4 行 */
    cap('道具 · 16', 195, 312, '11px', '#f5c451');
    const propOk = props.map((id, i) => {
      const cx = 58 + (i % 4) * 91;
      const cy = 398 + Math.floor(i / 4) * 92;
      /* 道具本体天然小于楼体（多为贴墙挂件），0.55 会缩成点状 ⇒ 放到 0.85 才辨得出形 */
      const ok = put(id, cx, cy, 0.85);
      cap(id.slice('prop.'.length), cx, cy + 34);
      return ok;
    });
    return {
      protos: protoOk.filter((v) => !v).length,
      props: propOk.filter((v) => !v).length,
      built: fx.children.length,
    };
  }, [PROTOS, PROPS]);
  await p.waitForTimeout(200);
  await shot(p, '07-catalog');
  await p.close();

  /* 07b：环境层 7（原台位整体下移 250 ⇒ 条带落在 y≈556..842） */
  const q = await phone(3);
  await open(q, 'demo=1&nofx=1&tour=0', false);
  await q.addStyleTag({ content: '#mono-share{display:none}' });
  facts.atmosphere = await q.evaluate(() => {
    const m = window.__monoMain;
    m.scene.reset();
    m.scene.render();
    const fx = m.stage.layers.fxUi;
    const cap = (text, y, color = '#9fb3a8', size = '11px') => {
      const d = document.createElement('div');
      d.textContent = text;
      d.style.cssText = `position:fixed;left:0;top:${y}px;width:390px;text-align:center;`
        + `font:${size} ui-monospace,monospace;color:${color};pointer-events:none`;
      document.body.appendChild(d);
    };
    /* 台位与 `src/render/AtmosphereView.ts` 的 `A` 表一致（左上角坐标，整体下移 DY） */
    const A = {
      'bg.sky': [[0, 0]], 'bg.stars': [[0, 306]], 'bg.moon': [[296, 318]], 'bg.ridge': [[0, 386]],
      'bg.lanternString': [[0, 430]], 'bg.street': [[0, 462]], 'bg.streetLamp': [[16, 496], [334, 496]],
    };
    const DY = 250;
    let built = 0;
    for (const [id, list] of Object.entries(A)) {
      for (const [x, y] of list) {
        const c = m.scene.buildOne({ id, c: 0, r: 0, pass: 1, fixed: { cx: x, cy: y + DY } });
        fx.addChild(c);
        built++;
      }
    }
    cap('环境层 · 7（自远及近，按 z 序叠加）', 24, '#f5c451', '12px');
    cap('bg.sky [0,0]（满屏渐变）· bg.stars [0,306] · bg.moon [296,318]', 50);
    cap('bg.ridge [0,386] · bg.lanternString [0,430] · bg.street [0,462]', 70);
    cap('bg.streetLamp [16,496] / [334,496]（同 id 两实例）', 90);
    cap('↓ 原台位整体下移 250 后的实景叠加（z 序 = 上表顺序）', 116, '#f5c451');
    return { built };
  });
  await q.waitForTimeout(200);
  await shot(q, '07b-atmosphere');
  await q.close();
}

/* —— 08：风格控制台（点棋盘选元素 → 套 night-neon → 导出 JSON） —— */
{
  const p = await phone();
  await open(p, 'debug=1&play=1&seed=20260928&humans=1&tour=0&nofx=1');
  facts.console = { mounted: await p.evaluate(() => Boolean(document.getElementById('mono-theme-console'))) };
  /* 沿右列地砖自上而下试点，选到第一个能命中的元素即止（控制台面板占左上角，故避开左侧） */
  for (const y of [150, 190, 230, 270, 110]) {
    await p.mouse.click(330, y);
    const sel = await p.evaluate(() => document.querySelector('#mono-theme-console input')?.value ?? '');
    if (sel) break;
  }
  facts.console.selected = await p.evaluate(() => document.querySelector('#mono-theme-console input')?.value ?? '');
  await p.locator('#mono-theme-console button', { hasText: 'night-neon' }).first().click();
  await p.waitForTimeout(120);
  await p.locator('#mono-theme-console button', { hasText: '导出 theme.json' }).first().click();
  await p.waitForTimeout(120);
  facts.console.exported = await p.evaluate(() => (document.querySelectorAll('#mono-theme-console textarea')[1]?.value ?? '').length);
  facts.console.wallL = await p.evaluate(() => {
    const id = document.querySelector('#mono-theme-console input')?.value ?? '';
    return window.__monoMain.scene.instancesOf().find((i) => i.id === id)?.provider?.params?.wallL ?? null;
  });
  await shot(p, '08-console');
  await p.close();
}

/* —— 09：Q 版人物四造型 + 三表情 + 停留气泡（合成版式，棋盘局部放大） —— */
{
  const p = await phone(3);
  await open(p, 'demo=1&nofx=1&tour=0', false);
  await p.addStyleTag({ content: '#mono-share{display:none}' });
  facts.players = await p.evaluate(() => {
    const m = window.__monoMain;
    m.scene.reset();
    m.scene.render();
    const fx = m.stage.layers.fxUi;
    const cap = (text, x, y, color = '#9fb3a8', size = '9px') => {
      const d = document.createElement('div');
      d.textContent = text;
      d.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:110px;margin-left:-55px;text-align:center;`
        + `font:${size} ui-monospace,monospace;color:${color};pointer-events:none`;
      document.body.appendChild(d);
    };
    const put = (spec) => {
      const c = m.scene.buildOne(spec);
      fx.addChild(c);
      return c.children.length > 0;
    };
    const head = (text, y) => {
      const d = document.createElement('div');
      d.textContent = text;
      d.style.cssText = `position:fixed;left:0;top:${y}px;width:390px;text-align:center;`
        + 'font:11px ui-monospace,monospace;color:#f5c451;pointer-events:none';
      document.body.appendChild(d);
    };
    const S = 1.7;
    /* 一、四造型（两男两女：短发 / 双马尾 / 小帽 / 丸子头），各染一条归属围巾 */
    head('Q 版人物 · 四造型（短发 / 双马尾 / 小帽 / 丸子头）', 22);
    const styles = ['短发 P1', '双马尾 P2', '小帽 P3', '丸子头 P4'];
    const row1 = styles.map((name, i) => {
      const cx = 58 + i * 90;
      const ok = put({ id: `piece.p${i + 1}`, c: 0, r: 0, pass: 3, fixed: { cx, cy: 118, s: S }, state: { owner: i + 1, mood: 'calm' } });
      cap(name, cx, 152);
      return ok;
    });
    /* 二、三表情（同一造型，`mood` 三态几何不同） */
    head('三表情 · calm / happy / sad（同一造型同一归属色）', 196);
    const row2 = ['calm', 'happy', 'sad'].map((mood, i) => {
      const cx = 105 + i * 90;
      const ok = put({ id: 'piece.p1', c: 0, r: 0, pass: 3, fixed: { cx, cy: 300, s: S }, state: { owner: 3, mood } });
      cap(mood, cx, 334);
      return ok;
    });
    /* 三、停留事件气泡四态（买地 / 收租 / 抽卡 / 进监狱） */
    head('停留事件气泡 · 四态（买地 / 收租 / 抽卡 / 进监狱）', 396);
    const tones = [
      ['buy', '长峰特产', '买地 ￥180'],
      ['rent', '御龙温泉', '租金 -￥105'],
      ['card', '命运卡', '抽到「鹿茸涨价」'],
      ['jail', '监狱', '停留 1 回合'],
    ];
    const row3 = tones.map(([tone, title, amount], i) => {
      const cx = 100 + (i % 2) * 190;
      const cy = 480 + Math.floor(i / 2) * 152;
      const ok = put({ id: 'ui.bubble', c: 0, r: 0, pass: 4, fixed: { cx, cy, s: 1 }, state: { title, amount, tone } });
      const pawnOk = put({ id: 'piece.p2', c: 0, r: 0, pass: 3, fixed: { cx, cy: cy + 62, s: S * 0.8 }, state: { owner: 2, mood: 'calm' } });
      return ok && pawnOk;
    });
    return {
      fails: [...row1, ...row2, ...row3].filter((v) => !v).length,
      built: fx.children.length,
    };
  });
  await p.waitForTimeout(200);
  await shot(p, '09-players');
  await p.close();
}

facts.files = files;
facts.errors = errors;
console.log(JSON.stringify({ origin: ORIGIN, facts }, null, 2));
await browser.close();
if (errors.length > 0) process.exit(1);
