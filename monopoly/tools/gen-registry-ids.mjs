import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// 用 esbuild 打包 src/skin/registry.ts 后求值：
// 必须 bundle（transformSync 是单文件转译，运行时相对导入如 `./layout` 在 data: URL 里无法解析）
import { buildSync } from 'esbuild';

const entry = fileURLToPath(new URL('../src/skin/registry.ts', import.meta.url));
const built = buildSync({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'neutral', logLevel: 'silent' });
const out = built.outputFiles[0].text;
const mod = await import('data:text/javascript;base64,' + Buffer.from(out).toString('base64'));
writeFileSync(new URL('./registry-ids.json', import.meta.url), JSON.stringify(mod.allElementIds(), null, 2));
console.log(`registry-ids.json: ${mod.allElementIds().length} ids`);
