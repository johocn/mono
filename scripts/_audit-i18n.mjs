// 临时审计脚本：比较各语言包相对 zh-CN 的缺失词条，输出每语言一份 missing JSON（供翻译补齐消费）。
// 语言包均为 `defineI18nLocale(() => zhFallbackLocale({ ...覆盖... }))` 结构，覆盖对象是纯 JS 字面量，可直接 eval。
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'd:/zhao/nshop/layers/base/i18n/locales';
const OUT_DIR = 'd:/zhao/scripts/_i18n-missing';

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

/**
 * 抽出 zhFallbackLocale( obj1, obj2, ... ) 的**全部**参数对象字面量并合并。
 * 关键：merge.ts 里 zhFallbackLocale 是 `(...overrides)`，会 reduce 深合并所有参数，
 * 只读第一个参数会把「写在第二个对象里」的译文误判成缺失（首版审计脚本就踩了这个坑）。
 */
function readOverride(file) {
  const src = fs.readFileSync(file, 'utf8');
  const at = src.indexOf('zhFallbackLocale(');
  if (at < 0) throw new Error(`${file} 未找到 zhFallbackLocale(`);
  const literals = [];
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
        literals.push(src.slice(start, i + 1));
        start = -1;
      }
    } else if (c === ')' && depth === 0) break;
  }
  if (!literals.length) throw new Error(`${file} 未取到任何覆盖对象字面量`);
  return literals
    // eslint-disable-next-line no-new-func
    .map((lit) => new Function(`return ${lit}`)())
    .reduce(deepMerge);
}

/** 与 merge.ts 一致的深合并：纯对象递归，数组 / 标量整值替换 */
function deepMerge(base, override) {
  const out = { ...base };
  for (const k of Object.keys(override)) {
    const b = base[k];
    const o = override[k];
    out[k] =
      b && o && typeof b === 'object' && typeof o === 'object' && !Array.isArray(b) && !Array.isArray(o)
        ? deepMerge(b, o)
        : o;
  }
  return out;
}

/** 抽出 zh-CN.ts 的 zhMessages 字面量 */
function readZh(file) {
  const src = fs.readFileSync(file, 'utf8');
  // eslint-disable-next-line no-new-func
  return new Function(`return ${extractObject(src, src.indexOf('{'))}`)();
}

/** 收集叶子路径（数组视为叶子，deepMerge 策略是整值替换） */
function leaves(obj, prefix = '', out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) leaves(v, p, out);
    else out.set(p, v);
  }
  return out;
}

/** 取出值里的所有字符串（数组递归展开） */
function stringsIn(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) stringsIn(v, out);
  return out;
}

const CJK = /[\u4e00-\u9fff]/;
/** ja-JP 用汉字书写，含汉字属正常，不参与「汉字泄漏」扫描 */
const CJK_EXEMPT = new Set(['ja-JP', 'zh-CN']);

const zh = leaves(readZh(path.join(DIR, 'zh-CN.ts')));
console.log(`zh-CN 叶子词条数: ${zh.size}\n`);

// --check [locale]：只读校验模式（不写清单文件、不改任何内容），供并行补齐的各语言代理自检
const args = process.argv.slice(2);
const checkMode = args.includes('--check');
const only = args.filter((a) => !a.startsWith('-'));

if (!checkMode) {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

const locales = (
  fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith('.ts') && !['zh-CN.ts', 'merge.ts'].includes(f))
    .map((f) => f.replace(/\.ts$/, ''))
).filter((l) => !only.length || only.includes(l));

if (checkMode) {
  let bad = 0;
  for (const loc of locales) {
    const own = leaves(readOverride(path.join(DIR, `${loc}.ts`)));
    const missing = [...zh.keys()].filter((p) => !own.has(p));
    if (missing.length) {
      bad++;
      console.log(`FAIL ${loc}: 仍缺 ${missing.length} 条，前 5 条: ${missing.slice(0, 5).join(', ')}`);
    } else {
      console.log(`PASS ${loc}: 与 zh-CN（${zh.size} 条）齐平`);
    }
  }
  process.exit(bad ? 1 : 0);
}

const rows = [];
const allExtras = {};
for (const loc of locales) {
  const own = leaves(readOverride(path.join(DIR, `${loc}.ts`)));
  const missing = [];
  const same = [];
  for (const [p, v] of zh) {
    if (!own.has(p)) missing.push({ path: p, zh: v });
    // 值与该语言的 zh 原文完全相同 **且中文原文含汉字** → 真漏译（值等于 zh 但无汉字的，如
    // "SKU: {code}" / "404" / "PayPal"，属有意保留，不计入）
    else if (typeof v === 'string' && own.get(p) === v && /[\u4e00-\u9fff]/.test(v))
      same.push({ path: p, zh: v });
  }
  const extra = [...own.keys()].filter((p) => !zh.has(p));
  if (extra.length) allExtras[loc] = extra;
  // 汉字泄漏兜底扫描：非日文语言包的值里不该出现汉字（部分翻译 / 直接照抄中文都会被抓到）
  const cjk = CJK_EXEMPT.has(loc)
    ? []
    : [...own.entries()]
        .filter(([, v]) => stringsIn(v).some((s) => CJK.test(s)))
        .map(([p, v]) => ({ path: p, value: v }));
  if (cjk.length) fs.writeFileSync(path.join(OUT_DIR, `${loc}.cjk.json`), JSON.stringify(cjk, null, 1));
  rows.push({ loc, own: own.size, missing: missing.length, extra: extra.length, same: same.length, cjk: cjk.length });
  if (missing.length) {
    fs.writeFileSync(path.join(OUT_DIR, `${loc}.json`), JSON.stringify(missing, null, 1));
  }
  if (same.length) {
    fs.writeFileSync(path.join(OUT_DIR, `${loc}.untranslated.json`), JSON.stringify(same, null, 1));
  }
}
if (Object.keys(allExtras).length) {
  fs.writeFileSync(path.join(OUT_DIR, '_extras.json'), JSON.stringify(allExtras, null, 1));
  console.log('「多余」键（本语言有、zh-CN 无）:', JSON.stringify(allExtras), '\n');
}
rows.sort((a, b) => b.missing - a.missing || b.same - a.same);
console.log('locale   已译键  缺失  值等于中文  含汉字  多余');
for (const r of rows)
  console.log(
    `${r.loc.padEnd(8)} ${String(r.own).padStart(5)} ${String(r.missing).padStart(6)} ${String(r.same).padStart(10)} ${String(r.cjk).padStart(7)} ${String(r.extra).padStart(5)}`,
  );
console.log(
  `\n合计缺失 ${rows.reduce((s, r) => s + r.missing, 0)} 条；逐语言缺口清单写入 ${OUT_DIR}/<locale>.json（有缺失时）`,
);
