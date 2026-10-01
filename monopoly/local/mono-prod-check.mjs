import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

/*
 * M7 线上回归（spec §11.1 / §11.7）：打**真实 URL**，拦住「本地绿但部署漏文件 /
 * CDN 缓存 / 路径 base:'./' 在子目录下解析错」这类只在线上暴露的问题。
 *
 * 断言：
 *   0 裸入口（无参数）→ 先弹开局面板： #mono-setup 存在、__monoMain.game === null
 *   0b ?humans=1&tour=0 → 跳过面板：1 真人 + 3 AI 席位、#mono-hud 就绪
 *   1 GET <ORIGIN>/mono.html → 200
 *   2 ?debug=1&play=1&seed=20260928&humans=4&tour=0：无 pageerror / 无 console error；__monoMain.game 就绪
 *   3 关键元素计数：board.tile.*=32 / ui.playerBar=4 / dice.body=2 / ui.handSlot=0（牌袋抽屉默认收起）
 *   4 ?skin=photo（+humans=4&tour=0）：missingAssets===0 且至少一个元素 providerKind==='image'
 *   5 整局可跑：?play=1 下 __monoMain.sim() 返回 1..4，state.over===true
 *   6 十张 390×844 @dpr2 截图入库 docs/verify/mono-prod-0{0..9}-*.png
 *     （07 骰面有点数 / 08 棋子移动 / 09 事件浮层 = M12 真机口径回归，spec §5.6）
 *   6b M11/M12 音频：**真实 AudioContext**（无桩）+ 真实手势解锁
 *     （audioLazy 懒建 ctx / audioUnlock 已解锁 / audioPlay 零点数∈2..12 且零异常 /
 *      audioPrefsDefault / audioIconsOn / audioMute 静音后无声 + 落库 / audioResume /
 *     audioKeys 结算后常驻 / audioForceMute 不建 ctx / fixDice·fixMove·fixEvent）
 *   6c P0 相机基座 / 拆层闸门（spec §8）：V15 分辨率未降 / V16 UI 解耦（平级兄弟 + 只含页面适配 k + 按钮逻辑高 ≥44）/
 *      V17 宽屏几何（1440×900 下 #mono-world 占宽 ≤40% 且两侧各留 ≥ UI_SIDE_W）
 *   7 gate 全 true 且 errors===[]，否则 exit(1)
 *
 * MONO_ORIGIN 默认 https://game.joho.cn/tour（可用环境变量覆盖为本地 preview 自测）。
 */

const ORIGIN = process.env.MONO_ORIGIN || 'https://game.joho.cn/tour';
const OUT = 'docs/verify';
mkdirSync(OUT, { recursive: true });

const gate = {};
const facts = {};
const errors = [];

/* 1) HTTP 200 */
const head = await fetch(`${ORIGIN}/mono.html`);
gate.http200 = head.status === 200;
facts.httpStatus = head.status;

const browser = await chromium.launch();
const attach = (page) => {
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
};

/*
 * 「有没有真的发声」探针——**不替换 AudioContext**。
 * 历史教训（2026-09-30 事故）：用 `AudioContextStub` 顶替真机后，假件比真机宽松，
 * 把 `src.buffer = { noise: true }` 这类真机必抛的 TypeError 吞掉了，线上才炸。
 * 现在用**真实 AudioContext**，只在 Web Audio 的调度原型上包一层计数：
 * 统计 `createOscillator()` / `createBufferSource()` 的 `start()` 调用次数。
 * 断言语义与旧桩一致（都是「排了几次音」），但不放宽任何真机行为。
 */
const realAudioProbe = () => {
  window.__audioStarts = 0;
  const wrap = (proto) => {
    if (!proto || typeof proto.start !== 'function') return;
    const start = proto.start;
    proto.start = function (...a) { window.__audioStarts += 1; return start.apply(this, a); };
  };
  wrap(window.AudioBufferSourceNode && window.AudioBufferSourceNode.prototype);
  wrap(window.OscillatorNode && window.OscillatorNode.prototype);
};

/* 2) + 3) 默认皮肤：就绪、无报错、元素计数 */
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
attach(page);
await page.goto(`${ORIGIN}/mono.html?debug=1&play=1&seed=20260928&humans=4&tour=0`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });

gate.gameReady = await page.evaluate(() => Boolean(window.__monoMain?.game));

facts.counts = await page.evaluate(() => {
  const ids = window.__monoMain.scene.instancesOf().map((i) => i.id);
  return {
    tile: ids.filter((id) => id.startsWith('board.tile.')).length,
    playerBar: ids.filter((id) => id === 'ui.playerBar').length,
    diceBody: ids.filter((id) => id === 'dice.body').length,
    handSlot: ids.filter((id) => id === 'ui.handSlot').length,
  };
});
gate.counts =
  facts.counts.tile === 32 &&
  facts.counts.playerBar === 4 &&
  facts.counts.diceBody === 2 &&
  /* 牌袋抽屉默认收起（spec §7.3）⇒ 首屏 0 个手牌槽；展开态由 V11 断言 */
  facts.counts.handSlot === 0;

await page.screenshot({ path: `${OUT}/mono-prod-01-board.png` });

/* 5) 整局可跑 */
facts.sim = await page.evaluate(() => {
  const m = window.__monoMain;
  const winner = m.sim();
  return { winner, over: m.game.state.over, round: m.game.state.round };
});
gate.sim = facts.sim.winner >= 1 && facts.sim.winner <= 4 && facts.sim.over === true;

await page.screenshot({ path: `${OUT}/mono-prod-02-play.png` });
await page.close();

/* 4) 换肤可用 */
const skinPage = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
attach(skinPage);
await skinPage.goto(`${ORIGIN}/mono.html?debug=1&play=1&seed=20260928&skin=photo&humans=4&tour=0`, { waitUntil: 'networkidle' });
await skinPage.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });

facts.skin = await skinPage.evaluate(() => {
  const m = window.__monoMain;
  const inst = m.scene.instancesOf();
  return {
    missingAssets: m.missingAssets.length,
    imageInstances: inst.filter((i) => i.providerKind === 'image').length,
  };
});
gate.skinAssets = facts.skin.missingAssets === 0;
gate.skinImages = facts.skin.imageInstances >= 1;

await skinPage.screenshot({ path: `${OUT}/mono-prod-03-skin-photo.png` });
await skinPage.close();

/* 0) 裸入口（无参数）= 先弹开局面板（spec §6）：game 未创建、面板可见 */
const entryPage = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
attach(entryPage);
await entryPage.goto(`${ORIGIN}/mono.html`, { waitUntil: 'networkidle' });
await entryPage.waitForFunction(() => Boolean(document.querySelector('#mono-setup')), null, { timeout: 20000 });

facts.defaultEntry = await entryPage.evaluate(() => ({
  hasSetup: Boolean(document.querySelector('#mono-setup')),
  gameIsNull: window.__monoMain.game === null,
}));
gate.defaultEntry = facts.defaultEntry.hasSetup && facts.defaultEntry.gameIsNull;

await entryPage.screenshot({ path: `${OUT}/mono-prod-00-default.png` });
await entryPage.close();

/* 0b) ?humans=1&tour=0：跳过面板 → 1 真人 + 3 AI 席位、HUD 就绪 */
const aiPage = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
attach(aiPage);
await aiPage.goto(`${ORIGIN}/mono.html?humans=1&tour=0`, { waitUntil: 'networkidle' });
await aiPage.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });

facts.aiSeat = await aiPage.evaluate(() => {
  const m = window.__monoMain;
  return {
    ai: m.seats.filter((s) => s !== null).length,
    humans: m.seats.filter((s) => s === null).length,
    hud: Boolean(document.querySelector('#mono-hud')),
  };
});
gate.aiSeat = facts.aiSeat.ai === 3 && facts.aiSeat.humans === 1 && facts.aiSeat.hud;

await aiPage.screenshot({ path: `${OUT}/mono-prod-04-ai-seat.png` });
await aiPage.close();

/* 8) M11 音频（spec §10.3）：真实手势解锁 / 音效发声 / 静音键语义 / `?audio=0` 不建 ctx */
const audioPage = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
attach(audioPage);
await audioPage.addInitScript(realAudioProbe);
await audioPage.goto(`${ORIGIN}/mono.html?play=1&seed=20260928&nofx=1&humans=4&tour=0`, { waitUntil: 'networkidle' });
await audioPage.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });

facts.audioBefore = await audioPage.evaluate(() => window.__monoMain.audio.isUnlocked());
gate.audioLazy = facts.audioBefore === false;             // boot 不建 ctx（spec §9）

/* 8a) 真实鼠标点击「掷骰」→ pointerdown 解锁 → 单实例 ctx + 真实发声 + 开态图标 */
await audioPage.locator('#mono-hud button[data-primary]').click();
await audioPage.waitForTimeout(150);
facts.audio = await audioPage.evaluate(() => ({
  unlocked: window.__monoMain.audio.isUnlocked(),
  starts: window.__audioStarts,
  dice: window.__monoMain.game.state.dice ? window.__monoMain.game.state.dice.total : null,
  prefs: window.__monoMain.audio.prefs(),
  icons: window.__monoMain.scene.instancesOf().filter((i) => i.id.startsWith('ui.sound.')).map((i) => i.id),
}));
gate.audioUnlock = facts.audio.unlocked === true;
/* 真机口径（spec §4.3b）：真实点击后要同时满足三件事——
 *   ① 页面零异常（旧版在这里抛 TypeError）；
 *   ② 确实排了音（无桩的真实 AudioContext 上仍计到 start）；
 *   ③ 画面确实推进过（paint() 执行 → 骰子点数落库在 2..12）。 */
gate.audioPlay = errors.length === 0
  && facts.audio.starts > 0
  && Number.isInteger(facts.audio.dice) && facts.audio.dice >= 2 && facts.audio.dice <= 12;
gate.audioPrefsDefault = facts.audio.prefs.sfx === true && facts.audio.prefs.bgm === true;
gate.audioIconsOn = facts.audio.icons.join(',') === 'ui.sound.on';

await audioPage.screenshot({ path: `${OUT}/mono-prod-05-audio-on.png` });

/* 8b) 点喇叭键 → 图标转「关」态、此后 play() 无声、落库 */
facts.audioMute = await audioPage.evaluate(() => {
  const m = window.__monoMain;
  document.querySelector('#mono-hud button[data-action="audio:sfx"]').click();
  const n0 = window.__audioStarts;
  m.audio.play('rent');
  return {
    off: m.audio.prefs().sfx === false,
    muted: window.__audioStarts === n0,
    stored: window.localStorage.getItem('mono.audio'),
    icons: m.scene.instancesOf().filter((i) => i.id.startsWith('ui.sound.')).map((i) => i.id),
  };
});
gate.audioMute = facts.audioMute.off && facts.audioMute.muted
  && facts.audioMute.stored === '{"sfx":false,"bgm":true}'
  && facts.audioMute.icons.join(',') === 'ui.sound.off';

await audioPage.screenshot({ path: `${OUT}/mono-prod-06-audio-off.png` });

/* 8c) 点回 → 图标转「开」态 + 恢复发声（含一声 `ui` 确认音） */
facts.audioResume = await audioPage.evaluate(() => {
  const m = window.__monoMain;
  const n0 = window.__audioStarts;
  document.querySelector('#mono-hud button[data-action="audio:sfx"]').click();
  return { on: m.audio.prefs().sfx === true, resumed: window.__audioStarts > n0 };
});
gate.audioResume = facts.audioResume.on && facts.audioResume.resumed;

/* 8d) 两枚静音键在命中层常驻（结算后仍在，spec §7.2 的早退坑回归） */
facts.audioKeys = await audioPage.evaluate(() => {
  const count = () => document.querySelectorAll('#mono-hud button[data-action^="audio:"]').length;
  const before = count();
  window.__monoMain.sim();
  return { before, afterOver: count() };
});
gate.audioKeys = facts.audioKeys.before === 2 && facts.audioKeys.afterOver === 2;
await audioPage.close();

/* 8e) `?audio=0`：全静音且**不创建** AudioContext（spec §8.2 / §12） */
const mutePage = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
attach(mutePage);
await mutePage.addInitScript(realAudioProbe);
await mutePage.goto(`${ORIGIN}/mono.html?audio=0&play=1&seed=20260928&nofx=1&humans=4&tour=0`, { waitUntil: 'networkidle' });
await mutePage.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });
await mutePage.locator('#mono-hud button[data-primary]').click();
await mutePage.evaluate(() => window.__monoMain.audio.startBgm());
await mutePage.waitForTimeout(80);
facts.audioForceMute = await mutePage.evaluate(() => ({
  unlocked: window.__monoMain.audio.isUnlocked(),
  starts: window.__audioStarts,
  prefs: window.__monoMain.audio.prefs(),
}));
gate.audioForceMute = facts.audioForceMute.unlocked === false
  && facts.audioForceMute.starts === 0
  && facts.audioForceMute.prefs.sfx === false && facts.audioForceMute.prefs.bgm === false;
await mutePage.close();

/* 8f) 真机口径回归截图（spec §5.6）：真实手势 + 真实 AudioContext —— 无桩因果链上取证 */
const fixPage = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
attach(fixPage);
await fixPage.addInitScript(realAudioProbe);
await fixPage.goto(`${ORIGIN}/mono.html?humans=1&tour=0&seed=20260928`, { waitUntil: 'networkidle' });
await fixPage.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });

const fixPrimary = fixPage.locator('#mono-hud button[data-primary]');

/* 07）真实点击「掷骰」→ 等动效到终帧 → 骰面必须显示出点数 */
await fixPrimary.click();
await fixPage.waitForFunction(() => window.__monoMain?.game?.state?.dice?.total, null, { timeout: 8000 });
await fixPage.waitForFunction(() => !window.__monoMain.fx?.busy?.(), null, { timeout: 8000 }).catch(() => {});
await fixPage.screenshot({ path: `${OUT}/mono-prod-07-dice-pips.png` });
facts.fixDice = await fixPage.evaluate(() => ({
  total: window.__monoMain.game.state.dice.total,
  phase: window.__monoMain.game.state.phase,
  unlocked: window.__monoMain.audio.isUnlocked(),
}));
gate.fixDice = facts.fixDice.unlocked === true
  && facts.fixDice.phase === 'rolled'
  && Number.isInteger(facts.fixDice.total)
  && facts.fixDice.total >= 2 && facts.fixDice.total <= 12;

/* 08）真实点击「前进」→ 动效进行中截「棋子移动」帧 */
await fixPrimary.click();
await fixPage.waitForFunction(() => window.__monoMain.fx?.busy?.() === true, null, { timeout: 8000 }).catch(() => {});
await fixPage.screenshot({ path: `${OUT}/mono-prod-08-pawn-move.png` });
facts.fixMove = await fixPage.evaluate(() => ({
  phase: window.__monoMain.game.state.phase,
  pos: window.__monoMain.game.state.players.map((p) => p.pos),
}));
gate.fixMove = facts.fixMove.pos[0] > 0;   // 以「人物确实前进了」为准（不依赖能否抓到中间帧）

/* 09）继续推进（AI 回合走 skipRest）直到落事件格、浮层展开，再截图
 * 预算 300 次：真人一回合要 4 次点击（掷骰/前进/结算/结束）+ 每轮 3 个 AI 回合，
 * 约 7 次/轮；seed=20260928 下真人首次落到命运/机会格在第 14 轮（≈98 次），
 * 故 80 次预算必然跑不到，曾导致 fixEvent 恒 false。 */
for (let i = 0; i < 300; i += 1) {
  const st = await fixPage.evaluate(() => {
    const m = window.__monoMain;
    const s = m.game.state;
    return {
      over: s.over,
      isHuman: m.seats[s.current] === null,
      phase: s.phase,
      lastDraw: Boolean(s.lastDraw),
      drawClose: document.querySelector('#mono-panels button[data-action="card:close"]') !== null,
    };
  });
  if (st.over || (st.phase === 'settled' && st.lastDraw)) break;
  if (st.isHuman) {
    const sel = st.drawClose
      ? '#mono-panels button[data-action="card:close"]'
      : '#mono-hud button[data-primary]';
    await fixPage.locator(sel).click({ timeout: 5000 }).catch(() => {});
    await fixPage.waitForTimeout(40);
  } else {
    await fixPage.evaluate(() => window.__monoMain.aiDriver.skipRest());
    await fixPage.waitForTimeout(20);
  }
}
await fixPage.waitForFunction(() => !window.__monoMain.fx?.busy?.(), null, { timeout: 8000 }).catch(() => {});
await fixPage.screenshot({ path: `${OUT}/mono-prod-09-event.png` });
facts.fixEvent = await fixPage.evaluate(() => {
  const s = window.__monoMain.game.state;
  const panels = document.querySelector('#mono-panels');
  return {
    overlayDraw: s.phase === 'settled' && Boolean(s.lastDraw),
    deck: s.lastDraw ? s.lastDraw.deck : null,
    round: s.round,
    panels: panels ? panels.children.length : 0,
  };
});
gate.fixEvent = facts.fixEvent.overlayDraw === true;
await fixPage.close();

/* ================= Task 11：画面重设计闸门 V1–V14（spec §11.2） ================= */

/* —— V1：`theme.json` 合法性（纯文件校验；`match` 展开用注册表 id 清单） —— */
const themeJson = JSON.parse(readFileSync('public/config/theme.json', 'utf8'));
const regIds = JSON.parse(readFileSync('tools/registry-ids.json', 'utf8'));
const PALETTE_KEYS = ['wallL', 'wallR', 'roof', 'win', 'sign', 'tileFill', 'tileEdge', 'glow'];
const PRESET_WHITELIST = ['stall', 'shop', 'market3', 'onsenHouse', 'gate', 'barn'];
/** 段通配（`*` 匹配整段、同段数才命中）——与 `src/skin/theme.ts` 的 `globMatch` 同口径 */
const globMatch = (pat, id) => {
  const a = pat.split('.');
  const b = id.split('.');
  return a.length === b.length && a.every((s, i) => s === '*' || s === b[i]);
};
/** 单元素 id 的「最终生效 palette」= 最后一条命中且有 `palette` 的 binding（同 theme.ts 的后者覆盖语义） */
const paletteOf = (id) => {
  let out = null;
  for (const b of themeJson.bindings) if (b.palette && globMatch(b.match, id)) out = b.palette;
  return out;
};
const PALETTES = Object.keys(themeJson.palettes);
facts.v1 = {
  palettes: PALETTES.length,
  keysOk: Object.values(themeJson.palettes)
    .every((p) => PALETTE_KEYS.every((k) => /^#[0-9a-f]{6}$/i.test(String(p[k] ?? '')))),
  slotsOk: themeJson.bindings.every((b) => b.paletteBySlot === undefined || b.paletteBySlot.length === 32),
  expanded: themeJson.bindings.map((b) => regIds.filter((id) => globMatch(b.match, id)).length),
  presets: themeJson.bindings.filter((b) => b.preset).map((b) => b.preset),
};
gate.v1 = facts.v1.palettes === 5 && facts.v1.keysOk && facts.v1.slotsOk
  && facts.v1.expanded.every((n) => n >= 1)
  && facts.v1.presets.every((p) => PRESET_WHITELIST.includes(p));

/* —— 像素取证：截图 PNG → data URL → 空白页 canvas 解码（不引入 pngjs，沿用 D7 探针口径） —— */
const pxPage = await browser.newPage();
await pxPage.goto('about:blank');
const dataUrl = (buf) => `data:image/png;base64,${buf.toString('base64')}`;
/** 条带（CSS 坐标 y0..y1）的**主色**（16 级量化后最高频）与「非主色像素占比」 */
const bandStats = (buf, y0, y1) => pxPage.evaluate(async ([u, lo, hi]) => {
  const img = await new Promise((ok, no) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = no;
    i.src = u;
  });
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth;
  cv.height = img.naturalHeight;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0);
  const top = Math.max(0, Math.floor(lo * 2));
  const bottom = Math.min(cv.height, Math.ceil(hi * 2));
  const d = cx.getImageData(0, top, cv.width, bottom - top).data;
  const hist = new Map();
  for (let i = 0; i < d.length; i += 4) {
    const k = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
    hist.set(k, (hist.get(k) ?? 0) + 1);
  }
  let best = 0;
  let bestN = -1;
  let total = 0;
  for (const [k, n] of hist) { total += n; if (n > bestN) { bestN = n; best = k; } }
  return {
    dom: [((best >> 8) & 15) * 16 + 8, ((best >> 4) & 15) * 16 + 8, (best & 15) * 16 + 8],
    domPct: Number(((bestN / total) * 100).toFixed(2)),
    nonDomPct: Number((((total - bestN) / total) * 100).toFixed(2)),
    colors: hist.size,
  };
}, [dataUrl(buf), y0, y1]);
/** 两张同尺寸截图的条带差异（差异像素占比 / 最大与平均 RGB 绝对差之和） */
const diffStats = (a, b, y0, y1) => pxPage.evaluate(async ([ua, ub, lo, hi]) => {
  const load = (u) => new Promise((ok, no) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = no;
    i.src = u;
  });
  const [ia, ib] = await Promise.all([load(ua), load(ub)]);
  const w = ia.naturalWidth;
  const h = ia.naturalHeight;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(ia, 0, 0);
  const da = cx.getImageData(0, 0, w, h).data;
  cx.clearRect(0, 0, w, h);
  cx.drawImage(ib, 0, 0);
  const db = cx.getImageData(0, 0, w, h).data;
  const top = Math.max(0, Math.floor(lo * 2));
  const bottom = Math.min(h, Math.ceil(hi * 2));
  let n = 0;
  let sum = 0;
  let max = 0;
  for (let y = top; y < bottom; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
      if (d > 0) { n++; sum += d; if (d > max) max = d; }
    }
  }
  return {
    diffPx: n,
    pct: Number(((n / ((bottom - top) * w)) * 100).toFixed(3)),
    maxDelta: max,
    avgDelta: n ? Number((sum / n).toFixed(2)) : 0,
  };
}, [dataUrl(a), dataUrl(b), y0, y1]);

/* —— V2：五套配色可换（两两主色不同）+ `?theme=off` 回落 skin.json —— */
const themePage = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
attach(themePage);
const themeShots = {};
for (const [label, q] of [['factory', ''], ...PALETTES.map((p) => [p, p]), ['off', 'off']]) {
  await themePage.goto(`${ORIGIN}/mono.html?debug=1&play=1&seed=20260928&humans=4&tour=0&nofx=1${q ? `&theme=${q}` : ''}`, { waitUntil: 'networkidle' });
  await themePage.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });
  themeShots[label] = await themePage.screenshot();
}
await themePage.close();
facts.v2 = {};
for (const id of PALETTES) {
  const s = await bandStats(themeShots[id], 92, 300);
  facts.v2[id] = { dom: s.dom.join(','), domPct: s.domPct, colors: s.colors };
}
/* 「两两主色不同」用棋盘区**画面差异**判：主色量化会被深色夜空吞掉（五套都会落到同一档），
   故改为两两比对差异像素占比（同一画面重截为 0%），门槛 1%。 */
facts.v2Pairs = {};
for (let i = 0; i < PALETTES.length; i++) {
  for (let j = i + 1; j < PALETTES.length; j++) {
    const d = await diffStats(themeShots[PALETTES[i]], themeShots[PALETTES[j]], 92, 300);
    facts.v2Pairs[`${PALETTES[i]}|${PALETTES[j]}`] = d.pct;
  }
}
gate.v2 = Object.values(facts.v2Pairs).every((p) => p > 1);
facts.v2OffVsFactory = await diffStats(themeShots.off, themeShots.factory, 92, 300);
gate.v2b = facts.v2OffVsFactory.pct > 1;   // `?theme=off` 与出厂 theme.json 在棋盘区确有肉眼级差异

/* —— V8：中部条带（y∈[320,508]）画面非「纯背景色」占比 > 20%
   （该条带是棋盘下缘与底坞之间的「街景带」；若只剩大片背景色，说明道具/楼体/名牌没长出来） —— */
facts.v8 = await bandStats(themeShots.factory, 320, 508);
gate.v8 = facts.v8.nonDomPct > 20;

/* —— 单页复用：V3 / V4 / V5 / V6 / V9 / V11 / V12 / V13（play 局 + `?debug=1` 控制台） —— */
const vPage = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
attach(vPage);
await vPage.goto(`${ORIGIN}/mono.html?debug=1&play=1&seed=20260928&humans=4&tour=0`, { waitUntil: 'networkidle' });
await vPage.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });

/* V3：单元素指派生效（精确 binding 压过通配的 paletteBySlot）+ 改 binding 即时变化 + `reset()` 还原 */
facts.v3 = await vPage.evaluate(() => {
  const m = window.__monoMain;
  const wallL = () => m.scene.instancesOf().find((i) => i.id === 'building.s4.l2')?.provider?.params?.wallL;
  const before = wallL();
  m.themeConsole.setPalette('building.s4.l2', 'night-neon');
  const after = wallL();
  const edits = Object.keys(m.themeConsole.edits()).length;
  m.themeConsole.reset();
  return { before, after, edits, restored: wallL() };
});
{
  const want = themeJson.palettes[paletteOf('building.s4.l2')].wallL;
  facts.v3.want = want;
  gate.v3 = facts.v3.before === want
    && facts.v3.after === themeJson.palettes['night-neon'].wallL
    && facts.v3.edits >= 1
    && facts.v3.restored === want;
}

/* V4：单素材独立风格（`params` 压过 palette，且不外溢到其他 `prop.*`） */
facts.v4 = await vPage.evaluate(() => {
  const m = window.__monoMain;
  const glow = (id) => m.scene.instancesOf().find((i) => i.id === id)?.provider?.params?.glow;
  const before = { sign: glow('prop.signTower'), tree: glow('prop.tree') };
  m.themeConsole.setParams('prop.signTower', { glow: false });
  const after = { sign: glow('prop.signTower'), tree: glow('prop.tree') };
  m.themeConsole.reset();
  return { before, after, restored: glow('prop.signTower') };
});
gate.v4 = facts.v4.after.sign === false
  && facts.v4.after.tree === facts.v4.before.tree
  && facts.v4.restored === facts.v4.before.sign;

/* V5：楼体不再被归属色相染色 —— `hue` 只跟「楼层」走（skin.json 常量），与 owner 无关 */
facts.v5 = await vPage.evaluate(() => {
  const bld = window.__monoMain.scene.instancesOf().filter((i) => /^building\.s\d+\.l\d$/.test(i.id));
  const byLevel = {};
  const byOwner = {};
  for (const i of bld) {
    const lv = i.id.split('.').pop();
    (byLevel[lv] ??= new Set()).add(String(i.provider?.params?.hue));
    (byOwner[String(i.state?.owner)] ??= new Set()).add(`${lv}=${i.provider?.params?.hue}`);
  }
  const toObj = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, [...v].sort()]));
  return { count: bld.length, byLevel: toObj(byLevel), byOwner: toObj(byOwner) };
});
{
  const SKIN_HUE = { l1: 32, l2: 30, l3: 200 };   // public/skins/default/skin.json 的楼体常量
  facts.v5.skinHue = SKIN_HUE;
  gate.v5 = facts.v5.count > 0
    /* 同楼层内 hue 唯一（若仍由 owner 派生，同层不同 owner 会散开） */
    && Object.values(facts.v5.byLevel).every((v) => v.length === 1)
    /* 且逐层等于 skin.json 常量 ⇒ 与 owner 无任何关系 */
    && Object.entries(SKIN_HUE).every(([lv, h]) => facts.v5.byLevel[lv]?.length === 1
      && Number(facts.v5.byLevel[lv][0]) === h);
}

/* V7：棋盘放大到「占屏高 ≥ 1/3」且整块落在顶部 HUD 之下、街市带之上（口径见手册 M13/M14）
   —— 纵向带 [oy−hh, oy+16·hh]（首行格顶 → 末行格心）必须 ⊆ [40, SHOWCASE_Y]；带高 17·hh 占底坞上沿 DOCK_Y 的比例 ≥ 33%
   注：11×7 改形后 hh 13→18（棋盘高 234→324），下界随之从旧口径 320 放到街市带上沿 SHOWCASE_Y=406 */
facts.v7 = await vPage.evaluate(() => {
  const geo = window.__monoMain.geo;
  const top = geo.oy - geo.hh;
  const bottom = geo.oy + 16 * geo.hh;
  return { hw: geo.hw, top, bottom, height: bottom - top };
});
{
  const DOCK_Y = 606;        // src/skin/layout.ts：底坞上沿（棋盘可用区的下界）
  const SHOWCASE_Y = 406;    // src/skin/layout.ts：中部天际线街市带上沿 = 棋盘可用区的下界
  facts.v7.dockY = DOCK_Y;
  facts.v7.sharePct = Number((((facts.v7.height / DOCK_Y) * 100)).toFixed(1));
  gate.v7 = facts.v7.hw === 21.5
    && facts.v7.top >= 40 && facts.v7.bottom <= SHOWCASE_Y
    && facts.v7.height / DOCK_Y >= 0.33;
}

/* V6 / V13：名牌齐备与当前格放大 / 棋子四造型（live 侧；几何细节由 test/render/label.spec.ts、proc-pawn.spec.ts 断言） */
facts.v6 = await vPage.evaluate(() => {
  const inst = window.__monoMain.scene.instancesOf();
  const labels = window.__monoMain.stage.layers.labels.children;
  const texts = labels.filter((c) => typeof c.text === 'string');
  const gfx = labels.filter((c) => typeof c.text !== 'string');
  const fs = texts.map((t) => t.style.fontSize);
  const pawns = inst.filter((i) => i.id.startsWith('piece.'));
  return {
    all: labels.length,
    texts: texts.length,
    graphics: gfx.length,
    /* 金环 = 名牌层里唯一一个「高过胶囊」的 Graphics（胶囊 h=13，金环 = (hh+out)×2 ≥ 26） */
    ring: gfx.filter((g) => g.getBounds().height > 20).length,
    /* 当前格 1.25×：4 字基准 fs10 → 12.5，全盘唯一一枚 */
    scaled: fs.filter((v) => Math.abs(v - 12.5) < 0.01).length,
    fs: [...new Set(fs)].sort((a, b) => a - b),
    pawns: pawns.map((i) => ({
      id: i.id, style: i.provider?.params?.style, owner: i.state?.owner,
      mood: i.state?.mood, active: i.state?.active === true,
    })),
  };
});
gate.v6 = facts.v6.texts === 32 && facts.v6.graphics === 33 && facts.v6.ring === 1 && facts.v6.scaled === 1;
facts.v13 = {
  styles: [...new Set(facts.v6.pawns.map((p) => p.style))].sort(),
  owners: facts.v6.pawns.map((p) => p.owner).sort(),
  moods: [...new Set(facts.v6.pawns.map((p) => p.mood))],
  active: facts.v6.pawns.filter((p) => p.active).length,
};
gate.v13 = facts.v13.styles.join(',') === 'bun,cap,short,twintail'
  && facts.v13.owners.join(',') === '1,2,3,4';

/* V9：1 条 4 段资产条 —— 渲染层实测 4 段等宽等距、无缝相接；且与 DOM 命中层零交叠（资产条不吞点击） */
facts.v9 = await vPage.evaluate(() => {
  const m = window.__monoMain;
  const rd = (v) => Math.round(v);
  const bars = m.stage.layers.fxUi.children
    .map((c) => c.getBounds())
    .filter((b) => Math.abs(b.height - 41) < 3 && Math.abs(b.width - 96) < 4)
    .map((b) => ({ x: rd(b.x), y: rd(b.y), w: rd(b.width), h: rd(b.height) }))
    .sort((a, b) => a.x - b.x);
  const btns = [...document.querySelectorAll('#mono-hud button')].map((b) => {
    const r = b.getBoundingClientRect();
    return { a: b.dataset.action, y: rd(r.top), h: rd(r.height) };
  });
  const top = bars.length ? bars[0].y : 0;
  const bottom = bars.length ? bars[0].y + bars[0].h : 0;
  return {
    bars,
    deltas: bars.slice(1).map((b, i) => b.x - bars[i].x),
    overlap: btns.filter((b) => b.y < bottom && b.y + b.h > top).map((b) => b.a),
  };
});
gate.v9 = facts.v9.bars.length === 4
  && facts.v9.deltas.every((d) => Math.abs(d - 94.5) <= 1.5)
  && facts.v9.overlap.length === 0;

/* V11：牌袋抽屉可开关；关闭时无手牌槽参与命中（DOM 命中层里没有任何手牌槽键位） */
facts.v11 = await vPage.evaluate(() => {
  const m = window.__monoMain;
  const slots = () => m.scene.instancesOf().filter((i) => i.id === 'ui.handSlot').length;
  const click = (a) => document.querySelector(`#mono-hud button[data-action="${a}"]`)?.click();
  const closed = slots();
  click('hand');
  const opened = slots();
  const qk = m.scene.instancesOf().filter((i) => i.id === 'ui.qk').map((i) => i.state?.label);
  const actions = [...document.querySelectorAll('#mono-hud button')].map((b) => b.dataset.action);
  click('hand');
  return { closed, opened, reclosed: slots(), qk, actions };
});
gate.v11 = facts.v11.closed === 0 && facts.v11.opened === 5 && facts.v11.reclosed === 0
  && facts.v11.qk.includes('收起手牌')
  && !facts.v11.actions.some((a) => /handSlot/i.test(String(a)));

/* V12：素材库完备（6 原型 + 16 道具 + 7 环境层全可达；`scene` ≤ 200；无缺素材） */
const PROP_IDS = [
  'prop.awning', 'prop.lantern', 'prop.banner', 'prop.rooftopBox', 'prop.signTower', 'prop.antenna',
  'prop.tree', 'prop.lamp', 'prop.flagpole', 'prop.chimney', 'prop.barrel', 'prop.lionStone',
  'prop.snowPile', 'prop.clothesline', 'prop.steamVent', 'prop.stoneLantern',
];
const BG_IDS = ['bg.sky', 'bg.stars', 'bg.moon', 'bg.ridge', 'bg.street', 'bg.lanternString', 'bg.streetLamp'];
facts.v12 = await vPage.evaluate(([props, bgs, protos]) => {
  const m = window.__monoMain;
  const ok = (id) => {
    try { return m.scene.buildOne({ id, c: 1, r: 1, pass: 4 }).children.length > 0; } catch { return false; }
  };
  const inst = m.scene.instancesOf();
  const st = m.scene.stats();
  return {
    props: props.filter((id) => !ok(id)),
    bg: bgs.filter((id) => !ok(id)),
    protos,
    livePresets: [...new Set(inst.filter((i) => /^building\.s\d+\.l\d$/.test(i.id)).map((i) => i.provider?.preset))],
    liveBg: new Set(inst.filter((i) => i.id.startsWith('bg.')).map((i) => i.id)).size,
    scene: st.perPass[1] + st.perPass[2] + st.perPass[3],
    total: st.total,
    missing: m.missingAssets.length,
  };
}, [PROP_IDS, BG_IDS, PRESET_WHITELIST]);
gate.v12 = facts.v12.props.length === 0 && facts.v12.bg.length === 0
  && PRESET_WHITELIST.every((p) => facts.v12.livePresets.includes(p))
  && facts.v12.liveBg === 7 && facts.v12.scene <= 200 && facts.v12.missing === 0;
await vPage.close();

/* —— V10 / V6b：落地地块卡（`settled` 出现 + 「升级」可点且落在 `TILE_CARD_BTN_Y`；`idle` 不可见） —— */
const cardPage = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
attach(cardPage);
await cardPage.goto(`${ORIGIN}/mono.html?debug=1&play=1&seed=20260928&humans=4&tour=0&nofx=1`, { waitUntil: 'networkidle' });
await cardPage.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });
facts.v10 = await cardPage.evaluate(() => {
  const m = window.__monoMain;
  const s = m.game.state;
  const inst = () => m.scene.instancesOf();
  const cards = () => inst().filter((i) => i.id === 'ui.tileCard');
  const btn = (a) => {
    const b = document.querySelector(`#mono-hud button[data-action="${a}"]`);
    return b ? { disabled: b.disabled, top: Math.round(b.getBoundingClientRect().top) } : null;
  };
  const idleCount = cards().length;
  const slot = inst().find((i) => i.id === 'board.tile.shop' && i.slot !== null).slot;
  const p = s.players[s.current];
  s.over = false;
  s.estates = {};
  s.estates[slot] = { index: slot, owner: p.id, level: 1, processing: false };
  p.cash = Math.max(p.cash, 5000);
  p.pos = slot;
  s.phase = 'settled';
  m.paint();
  const card = cards()[0];
  const up = btn('upgrade');
  s.phase = 'idle';
  m.paint();
  return {
    idleCount,
    title: String(card?.state?.title ?? ''),
    sub: String(card?.state?.sub ?? ''),
    up,
    after: cards().length,
    idleUp: btn('upgrade'),
  };
});
await cardPage.screenshot({ path: `${OUT}/mono-visual-04-tilecard.png` });
await cardPage.close();
gate.v10 = facts.v10.idleCount === 0 && facts.v10.title.startsWith('停在')
  && facts.v10.up !== null && facts.v10.up.disabled === false && facts.v10.up.top === 548
  && facts.v10.after === 0;
/* V6b：三重标记同时成立（金环 + 名牌 1.25× + 棋子光晕）+ 地块卡首行含「停在」
   —— 前两项由 gate.v6 的 `ring`/`scaled` 覆盖，第三项 = 场上恒有且仅有 1 枚 active 棋子 */
gate.v6b = gate.v6 && facts.v13.active === 1 && facts.v10.title.startsWith('停在');

/* —— V14：停留事件气泡四态（买地 / 收租 / 抽卡 / 进监狱）——
   动效必须真实播放（`?nofx=1` 会让气泡随终帧立刻收起），故这里不开 nofx。 */
const bubblePage = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
attach(bubblePage);
await bubblePage.goto(`${ORIGIN}/mono.html?debug=1&play=1&seed=20260928&humans=4&tour=0`, { waitUntil: 'networkidle' });
await bubblePage.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });
const readBubble = () => bubblePage.evaluate(() => {
  const m = window.__monoMain;
  const kids = m.stage.layers.fxUi.children;
  const b = kids.length ? kids[kids.length - 1].getBounds() : null;
  const rects = [...document.querySelectorAll('#mono-hud button')].map((x) => x.getBoundingClientRect());
  const hit = b === null ? false : rects.some((r) => r.left < b.x + b.width && r.right > b.x && r.top < b.y + b.height && r.bottom > b.y);
  const found = m.scene.instancesOf().filter((i) => i.id === 'ui.bubble');
  return {
    n: found.length,
    tone: found[0]?.state?.tone ?? null,
    amount: found[0]?.state?.amount ?? null,
    box: b ? [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)] : null,
    overlapped: hit,
    buttons: rects.length,
  };
});
const fireBubble = async (kind) => {
  /* 上一条动效播完再发下一条：真机上动效期间按钮是禁用的（`fxPending` 门），
     而这里直接用 `evaluate` 改状态绕过了那道门。 */
  await bubblePage.waitForFunction(() => !window.__monoMain.fx?.busy?.(), null, { timeout: 8000 }).catch(() => {});
  /* 冻结时轴再取景：气泡随 `fx` 终帧收起，而 `card` 动效仅 540ms（`fx.totalMs()`），
     Playwright 点击 + 读取的往返开销可达数百毫秒 ⇒ 不冻结就会读到「已收起」的空态
     （V14 的 card 用例曾因此偶发 n=0）。冻结只停观感、不动状态。 */
  await bubblePage.evaluate(() => window.__monoMain.fx.speed(0));
  await bubblePage.evaluate((k) => {
    const m = window.__monoMain;
    const s = m.game.state;
    const inst = m.scene.instancesOf();
    const pick = (type) => inst.find((i) => i.id === `board.tile.${type}` && i.slot !== null).slot;
    const p = s.players[s.current];
    s.over = false;
    s.phase = 'moved';
    s.lastDraw = null;
    s.estates = {};
    p.cash = 5000;
    if (k === 'rent') {
      const slot = pick('shop');
      s.estates[slot] = { index: slot, owner: p.id === 1 ? 2 : 1, level: 1, processing: false };
      p.pos = slot;
    } else if (k === 'card') {
      p.pos = pick('fate');
    } else if (k === 'jail') {
      p.pos = pick('jail');
    } else {
      p.pos = pick('shop');
    }
    m.paint();
  }, kind);
  await bubblePage.locator('#mono-hud button[data-primary]').click();
  await bubblePage.waitForTimeout(60);
  if (kind === 'buy') {
    await bubblePage.locator('#mono-hud button[data-action="buy"]').click();
    await bubblePage.waitForTimeout(60);
  }
  const out = await readBubble();
  await bubblePage.evaluate(() => window.__monoMain.fx.speed(1));   // 解冻，交回给下一条用例
  return out;
};
facts.v14 = { idle: await readBubble() };
for (const kind of ['rent', 'card', 'jail', 'buy']) facts.v14[kind] = await fireBubble(kind);
await bubblePage.waitForFunction(() => !window.__monoMain.fx?.busy?.(), null, { timeout: 8000 }).catch(() => {});
facts.v14.settle = await readBubble();
await bubblePage.screenshot({ path: `${OUT}/mono-visual-05-street.png` });
await bubblePage.close();
gate.v14 = facts.v14.idle.n === 0
  && ['rent', 'card', 'jail', 'buy'].every((k) => facts.v14[k].n === 1 && facts.v14[k].tone === k)
  && ['rent', 'card', 'jail', 'buy'].every((k) => facts.v14[k].overlapped === false)
  && facts.v14.buy.overlapped === false
  /* 气泡整块落在舞台内：11×7 的最左/最右格心离边缘不足半个气泡宽（半宽 50），
     不夹边就会越出画布被裁（`bubbleSpecs` 的 BUBBLE_EDGE_PAD，详见手册 M14 行 5b） */
  && ['rent', 'card', 'jail', 'buy'].every((k) => {
    const b = facts.v14[k].box;
    return Array.isArray(b) && b[0] >= 0 && b[0] + b[2] <= 390;
  })
  && facts.v14.settle.n === 0;

/* —— V15–V17：P0「解耦与相机基座」闸门（spec §8）——
   硬要求：拆层后**无任何可见变化**。三项分别锁「分辨率未降 / UI 解耦且命中不缩水 / 宽屏两侧留白」。 */
const p0Page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
attach(p0Page);
/* 不带 `debug=1`：本页只做几何/分辨率断言 + 留一张**干净首屏**截图（无风格控制台遮挡） */
await p0Page.goto(`${ORIGIN}/mono.html?play=1&seed=20260928&humans=4&tour=0`, { waitUntil: 'networkidle' });
await p0Page.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });

/* V15：分辨率未降 —— canvas 后备缓冲 = 逻辑尺寸 × devicePixelRatio（拆层不得动分辨率），
   且 CSS 逻辑尺寸仍是 390×844（fitStage 的页面适配在 390 视口下 k=1）。 */
facts.v15 = await p0Page.evaluate(() => {
  const c = document.getElementById('stage');
  const dpr = window.devicePixelRatio || 1;
  const r = c.getBoundingClientRect();
  return {
    w: c.width, h: c.height,
    expectW: Math.round(390 * dpr), expectH: Math.round(844 * dpr),
    cssW: Math.round(r.width), cssH: Math.round(r.height),
    dpr,
  };
});
gate.v15 = facts.v15.w === facts.v15.expectW && facts.v15.h === facts.v15.expectH
  && facts.v15.cssW === 390 && facts.v15.cssH === 844;

/* V16：UI 解耦（只断言解耦，命中高按逻辑尺寸）——
   ① `#mono-ui` 是 `#mono-world` 的平级兄弟、不是其子节点（DOM 层不跟相机）；
   ② `#mono-ui` 的 transform 只有页面适配 k（390 视口下 k=1），不含任何相机缩放；
   ③ 主按钮**逻辑布局高** `offsetHeight ≥ 44`（offsetHeight 不受 CSS transform 影响，
      即不乘页面适配 k —— 窄屏等比缩到 <44 记已知项，留待 P2 做窄屏 UI 适配，spec §8 注）。 */
facts.v16 = await p0Page.evaluate(() => {
  const ui = document.getElementById('mono-ui');
  const world = document.getElementById('mono-world');
  const tf = getComputedStyle(ui).transform;
  let k = 1;
  if (tf && tf !== 'none') {
    const m = tf.match(/matrix\(([^)]+)\)/);
    if (m) k = Number(m[1].split(',')[0]);
  }
  const btn = document.querySelector('#mono-hud button[data-primary]');
  return {
    uiExists: Boolean(ui), worldExists: Boolean(world),
    sameNode: ui === world,
    uiChildOfWorld: Boolean(world && ui) && world.contains(ui),
    k: Math.round(k * 1000) / 1000,
    btnH: btn ? btn.offsetHeight : 0,
  };
});
gate.v16 = facts.v16.uiExists && facts.v16.worldExists
  && facts.v16.sameNode === false && facts.v16.uiChildOfWorld === false
  && Math.abs(facts.v16.k - 1) < 1e-6
  && facts.v16.btnH >= 44;
await p0Page.screenshot({ path: `${OUT}/mono-prod-10-p0-mobile.png` });   // 390×844 @dpr2 首屏留证（P0 零可见变化）

/* V17：宽屏几何断言（侧栏留待后续）—— 1440×900 下 `#mono-world` 占宽 ≤ 40%，
   且左右各留 ≥ UI_SIDE_W(220) 空白，给后续侧栏与 UI 空间。 */
await p0Page.setViewportSize({ width: 1440, height: 900 });
await p0Page.waitForTimeout(80);   // 等 resize 监听里的 fitAll 落完
facts.v17 = await p0Page.evaluate(() => {
  const r = document.getElementById('mono-world').getBoundingClientRect();
  return {
    left: Math.round(r.left), width: Math.round(r.width),
    right: Math.round(window.innerWidth - r.right), vw: window.innerWidth,
  };
});
gate.v17 = facts.v17.width / facts.v17.vw <= 0.4
  && facts.v17.left >= 220 && facts.v17.right >= 220;
await p0Page.screenshot({ path: `${OUT}/mono-prod-11-p0-desktop.png` });   // 1440×900 两层几何留证
await p0Page.close();

/* 7) 无报错 + 汇总 */
gate.noErrors = errors.length === 0;
facts.screenshots = [
  `${OUT}/mono-prod-00-default.png`,
  `${OUT}/mono-prod-01-board.png`,
  `${OUT}/mono-prod-02-play.png`,
  `${OUT}/mono-prod-03-skin-photo.png`,
  `${OUT}/mono-prod-04-ai-seat.png`,
  `${OUT}/mono-prod-05-audio-on.png`,
  `${OUT}/mono-prod-06-audio-off.png`,
  `${OUT}/mono-prod-07-dice-pips.png`,
  `${OUT}/mono-prod-08-pawn-move.png`,
  `${OUT}/mono-prod-09-event.png`,
  `${OUT}/mono-prod-10-p0-mobile.png`,
  `${OUT}/mono-prod-11-p0-desktop.png`,
];

console.log(JSON.stringify({ origin: ORIGIN, facts, gate, errors }, null, 2));
await browser.close();

if (Object.values(gate).some((v) => !v) || errors.length > 0) process.exit(1);
