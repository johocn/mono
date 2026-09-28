import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import mono from './eslint-plugin-mono/index.js';

/** 构建期「禁写死」gate：src/render 下不得出现裸色值 / 裸视觉常数（spec §3.7.2） */
const ROOT = resolve(process.cwd(), 'src/render');

if (!existsSync(ROOT)) {
  console.log('[check-hardcoded] 无 src/render — skip');
  process.exit(0);
}

function walk(dir, acc) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (name.endsWith('.ts')) acc.push(p);
  }
  return acc;
}

const files = walk(ROOT, []);
if (files.length === 0) {
  console.log('[check-hardcoded] src/render 无可 lint 文件 — skip');
  process.exit(0);
}

const eslint = new ESLint({
  cwd: process.cwd(),
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ['**/*.ts'],
      languageOptions: { parser: tseslint.parser, ecmaVersion: 2022, sourceType: 'module' },
      plugins: { mono },
      rules: { 'mono/no-hardcoded-color': 'error', 'mono/no-visual-number': 'error' },
    },
  ],
});

const results = await eslint.lintFiles(files);
let violations = 0;
for (const r of results) {
  for (const m of r.messages) {
    if (m.severity === 0) continue;
    violations++;
    console.error(`${r.filePath}:${m.line ?? 0}: ${m.message}`);
  }
}

if (violations > 0) {
  console.error(`[check-hardcoded] ${violations} 处裸色值/裸视觉常数违规（spec §3.7.2）`);
  process.exit(1);
}
console.log(`[check-hardcoded] clean（${files.length} 个文件）`);