#!/usr/bin/env node
/**
 * game-server 原子发布部署 —— 部署协议.md 实现
 * 用法：
 *   node scripts/deploy.mjs                        # 完整发布
 *   node scripts/deploy.mjs init-server            # 一次性服务器迁移（releases/current/systemd）
 *   node scripts/deploy.mjs --selftest-bad-package # 演练：旧包（服务端预检应拦截，不切换）
 *   node scripts/deploy.mjs --selftest-bad-runtime # 演练：运行即崩（探针失败应自动回滚）
 */
import { execSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const NEEDLES = ['sso-exchange', 'health'];

export function scanNeedles(dir, needles = NEEDLES) {
  const found = new Set();
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) {
        const text = fs.readFileSync(p, 'utf8');
        for (const n of needles) if (text.includes(n)) found.add(n);
      }
    }
  };
  walk(dir);
  return needles.filter((n) => found.has(n));
}

export function checkDist(distDir) {
  const missing = NEEDLES.filter((n) => !scanNeedles(distDir).includes(n));
  return { ok: missing.length === 0, missing };
}

export function depsHash(pkgPath = path.join(ROOT, 'package.json')) {
  const deps = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).dependencies ?? {};
  const stable = Object.keys(deps).sort().map((k) => `${k}@${deps[k]}`).join('\n');
  return createHash('md5').update(stable).digest('hex');
}

// ---------- 以下为执行入口（测试导入不触发） ----------
const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  console.error('deploy pipeline: 在 Task 2/3 中实现');
  process.exit(1);
}
