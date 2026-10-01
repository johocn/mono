// 手机视口（390x844 dpr2）多语言首页截图：证明各 locale 页面渲染的是该语言文案。
// 用法：node scripts/_shot-i18n-locale.mjs [code...]，默认 zh-CN/en/de/ja/ru/ko/fa
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const HOST = process.env.HOST || 'https://www.youshop.cn';
const OUT = 'd:/zhao/docs/manual/shots/2026-10-01-i18n';
const codes = process.argv.slice(2);
const LIST = codes.length ? codes : ['zh-CN', 'en', 'de', 'ja', 'ru', 'ko', 'fa'];
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

for (const code of LIST) {
  const url = code === 'zh-CN' ? `${HOST}/t2` : `${HOST}/${code}/t2`;
  const res = await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const shot = `${OUT}/home-${code}.png`;
  await page.screenshot({ path: shot, fullPage: false });
  const title = (await page.title()).slice(0, 60);
  const rawKey = /messages\.[a-z]+\.[a-zA-Z]+/.test(await page.content());
  console.log(`${res.status()} ${code.padEnd(6)} title="${title}" 原始key泄漏=${rawKey} → ${shot}`);
}

await browser.close();
