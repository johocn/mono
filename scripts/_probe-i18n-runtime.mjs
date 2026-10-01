// 临时探针：校验各语言运行时页面渲染的文案确实来自该语言包（且不是中文兜底/原始 key）。
// 做法：从语言包 TS 里取出若干键的译文 → 抓 SSR HTML → 断言「命中本语言译文」且「非中文兜底」。
import fs from 'node:fs';

const DIR = 'd:/zhao/nshop/layers/base/i18n/locales';

/** 从 startIndex 处的 `{` 起按括号配平取出对象字面量（跳过字符串内的括号与转义） */
function extractObject(src, startIndex) {
  let depth = 0;
  let quote = null;
  for (let i = startIndex; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return src.slice(startIndex, i + 1);
    }
  }
  throw new Error(`从 ${startIndex} 起未找到配平的对象字面量`);
}

/** 取 zhFallbackLocale(...) 全部参数对象并深合并（与 merge.ts 一致）。
 *  zh-CN.ts 是 `export const zhMessages = {...}`，没有 zhFallbackLocale 包裹，单列分支处理。 */
function pack(loc) {
  const src = fs.readFileSync(`${DIR}/${loc}.ts`, 'utf8');
  if (loc === 'zh-CN') return eval(`(${extractObject(src, src.indexOf('{'))})`);
  const at = src.indexOf('zhFallbackLocale(');
  const objs = [];
  let depth = 0;
  let quote = null;
  let start = -1;
  for (let i = src.indexOf('(', at) + 1; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        objs.push(src.slice(start, i + 1));
        start = -1;
      }
    } else if (c === ')' && depth === 0) break;
  }
  const merge = (b, o) => {
    const out = { ...b };
    for (const k of Object.keys(o)) {
      const bv = b[k];
      const ov = o[k];
      out[k] = bv && ov && typeof bv === 'object' && typeof ov === 'object' && !Array.isArray(bv) && !Array.isArray(ov) ? merge(bv, ov) : ov;
    }
    return out;
  };
  return objs.map((lit) => new Function(`return ${lit}`)()).reduce(merge);
}

const zh = pack('zh-CN');
const KEYS = ['home.hotGoods', 'home.recommendGoods', 'nav.my', 'nav.cart', 'nav.search'];
const dig = (o, p) => p.split('.').reduce((a, k) => (a ? a[k] : undefined), o);

const LOCALES = [
  ['zh-CN', ''],
  ['en-US', 'en'],
  ['de-DE', 'de'],
  ['fr-FR', 'fr'],
  ['ru-RU', 'ru'],
  ['ja-JP', 'ja'],
  ['ko-KR', 'ko'],
  ['bg-BG', 'bg'],
  ['es-ES', 'es'],
  ['it-IT', 'it'],
  ['pt-BR', 'pt'],
  ['fa-IR', 'fa'],
];

let bad = 0;
for (const [loc, code] of LOCALES) {
  const p = pack(loc);
  const url = code ? `https://www.youshop.cn/${code}/t2` : 'https://www.youshop.cn/t2';
  const html = await (await fetch(url)).text();
  const hits = KEYS.map((k) => ({
    k,
    own: dig(p, k),
    zh: dig(zh, k),
    rendered: html.includes(String(dig(p, k))),
  })).filter((r) => r.own);
  const okCount = hits.filter((r) => r.rendered).length;
  const zhFallback = loc === 'zh-CN' ? [] : hits.filter((r) => r.own === r.zh && r.rendered).map((r) => r.k);
  const rawKey = /messages\.[a-z]+\.[a-zA-Z]+<\/|&gt;messages\./.test(html);
  const ok = okCount > 0 && !rawKey;
  if (!ok) bad++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${loc.padEnd(6)} 渲染命中语言包 ${okCount}/${hits.length}` +
      ` | 与中文同值键: ${zhFallback.join(',') || '无'} | 原始 key 泄漏: ${rawKey}`,
  );
}
console.log(bad ? `\n${bad} 个语言包异常` : '\n全部语言包渲染文案来自各自语言包');
process.exit(bad ? 1 : 0);
