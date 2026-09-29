import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

/*
 * M7 线上回归（spec §11.1 / §11.7）：打**真实 URL**，拦住「本地绿但部署漏文件 /
 * CDN 缓存 / 路径 base:'./' 在子目录下解析错」这类只在线上暴露的问题。
 *
 * 断言：
 *   0 裸入口（无参数）→ 先弹开局面板： #mono-setup 存在、__monoMain.game === null
 *   0b ?humans=1&tour=0 → 跳过面板：1 真人 + 3 AI 席位、#mono-hud 就绪
 *   1 GET <ORIGIN>/mono.html → 200
 *   2 ?debug=1&play=1&seed=20260928&humans=4&tour=0：无 pageerror / 无 console error；__monoMain.game 就绪
 *   3 关键元素计数：board.tile.*=32 / ui.playerBar=4 / dice.body=2 / ui.handSlot=5（与本地闸门一致）
 *   4 ?skin=photo（+humans=4&tour=0）：missingAssets===0 且至少一个元素 providerKind==='image'
 *   5 整局可跑：?play=1 下 __monoMain.sim() 返回 1..4，state.over===true
 *   6 五张 390×844 @dpr2 截图入库 docs/verify/mono-prod-0{0,1,2,3}-*.png + mono-prod-04-ai-seat.png
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

/* 记录「有没有真的发出声音」的 AudioContext 替身（只记次数，不产生声波） */
const audioStub = () => {
  window.__audioCtxCount = 0;
  window.__audioStarts = 0;
  const param = () => ({
    value: 0,
    setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {},
  });
  const node = () => ({ connect() {}, disconnect() {} });
  class AudioContextStub {
    constructor() {
      window.__audioCtxCount += 1;
      this.currentTime = 0;
      this.sampleRate = 48000;
      this.state = 'running';
      this.destination = {};
    }
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
    createGain() { return { ...node(), gain: param() }; }
    createOscillator() {
      return { ...node(), type: '', frequency: param(), start() { window.__audioStarts += 1; }, stop() {} };
    }
    createBufferSource() {
      return { ...node(), buffer: null, start() { window.__audioStarts += 1; }, stop() {} };
    }
    createBuffer() { return { getChannelData: () => new Float32Array(1) }; }
    decodeAudioData() { return Promise.resolve({}); }
  }
  window.AudioContext = AudioContextStub;
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
  facts.counts.handSlot === 5;

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
await audioPage.addInitScript(audioStub);
await audioPage.goto(`${ORIGIN}/mono.html?play=1&seed=20260928&nofx=1&humans=4&tour=0`, { waitUntil: 'networkidle' });
await audioPage.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });

facts.audioBefore = await audioPage.evaluate(() => window.__audioCtxCount);
gate.audioLazy = facts.audioBefore === 0;                 // boot 不建 AudioContext（spec §9）

/* 8a) 真实鼠标点击「掷骰」→ pointerdown 解锁 → 单实例 ctx + 真实发声 + 开态图标 */
await audioPage.locator('#mono-hud button[data-primary]').click();
await audioPage.waitForTimeout(150);
facts.audio = await audioPage.evaluate(() => ({
  ctxCount: window.__audioCtxCount,
  starts: window.__audioStarts,
  prefs: window.__monoMain.audio.prefs(),
  icons: window.__monoMain.scene.instancesOf().filter((i) => i.id.startsWith('ui.sound.')).map((i) => i.id),
}));
gate.audioUnlock = facts.audio.ctxCount === 1;
gate.audioPlay = facts.audio.starts > 0;
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
await mutePage.addInitScript(audioStub);
await mutePage.goto(`${ORIGIN}/mono.html?audio=0&play=1&seed=20260928&nofx=1&humans=4&tour=0`, { waitUntil: 'networkidle' });
await mutePage.waitForFunction(() => Boolean(window.__monoMain?.game), null, { timeout: 20000 });
await mutePage.locator('#mono-hud button[data-primary]').click();
await mutePage.evaluate(() => window.__monoMain.audio.startBgm());
await mutePage.waitForTimeout(80);
facts.audioForceMute = await mutePage.evaluate(() => ({
  ctxCount: window.__audioCtxCount, starts: window.__audioStarts, prefs: window.__monoMain.audio.prefs(),
}));
gate.audioForceMute = facts.audioForceMute.ctxCount === 0
  && facts.audioForceMute.starts === 0
  && facts.audioForceMute.prefs.sfx === false && facts.audioForceMute.prefs.bgm === false;
await mutePage.close();

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
];

console.log(JSON.stringify({ origin: ORIGIN, facts, gate, errors }, null, 2));
await browser.close();

if (Object.values(gate).some((v) => !v) || errors.length > 0) process.exit(1);
