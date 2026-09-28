import { readFileSync, writeFileSync } from 'node:fs';
// 直接用 vite 的 esbuild 转译能力：临时编译 src/skin/registry.ts
import { transformSync } from 'esbuild';

const src = readFileSync(new URL('../src/skin/registry.ts', import.meta.url), 'utf8');
const out = transformSync(src, { loader: 'ts', format: 'esm' }).code;
const mod = await import('data:text/javascript;base64,' + Buffer.from(out).toString('base64'));
writeFileSync(new URL('./registry-ids.json', import.meta.url), JSON.stringify(mod.allElementIds(), null, 2));
console.log(`registry-ids.json: ${mod.allElementIds().length} ids`);