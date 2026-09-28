import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SEG = '[a-z][a-z0-9]*';
const NS = ['token', 'board\\.tile', 'board\\.inner', 'board\\.center', 'building', 'prop', 'piece', 'dice', 'card', 'fx', 'ui'];
const ID_RE = new RegExp(`^(${NS.join('|')})(\\.${SEG}){1,2}$`);

/**
 * 皮肤包（校验输入，供 Vitest 与 CLI 共用）
 * @typedef {object} SkinFile
 * @property {string} id
 * @property {{ hw: number, hh: number, ox: number, oy: number }} geo
 * @property {Record<string, string>} tokens
 * @property {Record<string, any>} elements
 */

function checkProvider(id, p, exists) {
  const errs = [];
  if (!p || typeof p !== 'object') return [`${id}: provider 不是对象`];
  switch (p.kind) {
    case 'proc':
      if (typeof p.preset !== 'string' || !p.preset) errs.push(`${id}: proc.preset 缺失`);
      break;
    case 'image':
      if (typeof p.src !== 'string' || !p.src) errs.push(`${id}: image.src 缺失`);
      else if (!exists(p.src)) errs.push(`${id}: missing asset ${p.src}`);
      break;
    case 'atlas':
      if (typeof p.src !== 'string' || !p.src) errs.push(`${id}: atlas.src 缺失`);
      else if (!exists(p.src)) errs.push(`${id}: missing asset ${p.src}`);
      if (typeof p.frame !== 'string' || !p.frame) errs.push(`${id}: atlas.frame 缺失`);
      break;
    case 'frames':
      if (!Array.isArray(p.src) || p.src.length === 0) errs.push(`${id}: frames.src 缺失`);
      else for (const s of p.src) if (!exists(s)) errs.push(`${id}: missing asset ${s}`);
      if (typeof p.fps !== 'number' || !(p.fps > 0)) errs.push(`${id}: frames.fps 非法`);
      break;
    default:
      errs.push(`${id}: 未知 provider.kind=${String(p.kind)}`);
  }
  if (p.anchor !== undefined) {
    const [ax, ay] = p.anchor;
    if (!(ax >= 0 && ax <= 1) || !(ay >= 0 && ay <= 1)) errs.push(`${id}: anchor 越界`);
  }
  return errs;
}

/**
 * 皮肤包 schema 校验（纯函数，供 Vitest 与 CLI 共用）。
 * key 允许段通配：`building.*.l2` 归一化为 `building.s0.l2` 后再过 ID 正则，
 * 且只需命中「任一」注册 ID 即可（96 个 building.<slot>.l<lv> 因此只需 4 条 key）。
 */
export function validateSkin(skin, registeredIds, exists) {
  const errs = [];
  for (const k of ['hw', 'hh', 'ox', 'oy']) {
    if (typeof skin?.geo?.[k] !== 'number') errs.push(`geo.${k} 缺失或非数字`);
  }
  for (const [id, p] of Object.entries(skin?.elements ?? {})) {
    if (!registryHas(registeredIds, id)) { errs.push(`${id}: not in registry`); continue; }
    if (!ID_RE.test(id.replace(/\*/g, 's0'))) errs.push(`${id}: ID 不符合命名规范`);
    errs.push(...checkProvider(id, p, exists));
  }
  return errs;
}

/** 精确命中，或含 `*` 的段通配命中任一注册 ID */
export function registryHas(registeredIds, id) {
  if (registeredIds.has(id)) return true;
  if (!id.includes('*')) return false;
  const parts = id.split('.');
  for (const rid of registeredIds) {
    const rp = String(rid).split('.');
    if (rp.length === parts.length && parts.every((seg, i) => seg === '*' || seg === rp[i])) return true;
  }
  return false;
}

/** CLI：逐个校验 public/skins/<id>/skin.json（皮肤落盘前 public/skins 不存在时空跑通过） */
function main() {
  const root = resolve(process.cwd(), 'public/skins');
  if (!existsSync(root)) {
    console.log('[lint-skin] no public/skins（皮肤在 Task 9 落盘）— skip');
    process.exit(0);
  }
  const dirs = readdirSync(root);
  if (dirs.length === 0) {
    console.log('[lint-skin] public/skins 为空 — skip');
    process.exit(0);
  }
  const idsFile = new URL('./registry-ids.json', import.meta.url);
  const registeredIds = existsSync(idsFile)
    ? new Set(JSON.parse(readFileSync(idsFile, 'utf8')))
    : new Set();
  let failed = 0;
  let checked = 0;
  for (const dir of dirs) {
    const file = join(root, dir, 'skin.json');
    if (!existsSync(file)) continue;
    checked++;
    const skin = JSON.parse(readFileSync(file, 'utf8'));
    const exists = (rel) => existsSync(join(root, dir, rel));
    const errs = validateSkin(skin, registeredIds, exists);
    if (errs.length) { failed++; console.error(`[skin:${dir}]`); for (const e of errs) console.error('  - ' + e); }
    else console.log(`[skin:${dir}] OK`);
  }
  if (checked === 0) console.log('[lint-skin] public/skins 下无 skin.json — skip');
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && process.argv[1].endsWith('lint-skin.mjs')) main();