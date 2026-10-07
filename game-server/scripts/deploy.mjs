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

// ---------- systemd 单元（保留原 After/Wants 依赖，仅改 ExecStart） ----------
export const UNIT_OLD = `[Unit]
Description=Game Server (NestJS)
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
WorkingDirectory=/opt/game-server
ExecStart=/usr/local/bin/node dist/src/main
Restart=always
RestartSec=5
Environment=NODE_ENV=production
LimitNOFILE=65536
MemoryMax=500M

[Install]
WantedBy=multi-user.target
`;
export const UNIT_NEW = UNIT_OLD.replace(
  'ExecStart=/usr/local/bin/node dist/src/main',
  'ExecStart=/usr/local/bin/node current/dist/src/main',
);

const REMOTE_INIT = `#!/usr/bin/env bash
set -euo pipefail
ROOT=/opt/game-server
NEW=$1; OLD=$2; HASH=$3
TS=$(date +%Y%m%d-%H%M%S)
RELEASE=$ROOT/releases/$TS
revert() {
  echo "↩ 迁移失败，回退"
  rm -rf "$ROOT/current"
  [ -d "$ROOT/dist_pre_atomic_$TS" ] && mv "$ROOT/dist_pre_atomic_$TS" "$ROOT/dist"
  if [ -d "$ROOT/seeds_old_$TS" ]; then rm -rf "$ROOT/seeds"; mv "$ROOT/seeds_old_$TS" "$ROOT/seeds"; fi
  echo "$OLD" | base64 -d > /etc/systemd/system/game-server.service
  systemctl daemon-reload && systemctl restart game-server
  for i in $(seq 1 20); do
    sleep 2
    RC=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/health || true)
    if [ "$RC" = "200" ]; then break; fi
  done
  curl -s -o /dev/null -w "revert-health=%{http_code}\\n" http://127.0.0.1:3000/health
  exit 1
}
trap revert ERR
echo "$NEW" | base64 -d > /tmp/unit.new
echo "$OLD" | base64 -d > /tmp/unit.old
mkdir -p "$ROOT/releases" "$RELEASE"
cp -a "$ROOT/dist" "$RELEASE/dist"
[ -d "$ROOT/seeds" ] && cp -a "$ROOT/seeds" "$RELEASE/seeds"
echo "$HASH" > "$RELEASE/.deps-hash" && echo "$HASH" > "$ROOT/.deps-hash"
# node_modules 解析预检（切换前必须可达）
( cd "$RELEASE/dist/src" && node -e "require.resolve('@nestjs/core')" )
# seeds 改为随版本切换的 symlink
if [ -d "$ROOT/seeds" ] && [ ! -L "$ROOT/seeds" ]; then mv "$ROOT/seeds" "$ROOT/seeds_old_$TS"; fi
rm -rf "$ROOT/seeds" && ln -sfn current/seeds "$ROOT/seeds"
# dist 让位（协议禁覆盖目标）
mv "$ROOT/dist" "$ROOT/dist_pre_atomic_$TS"
# 切换 + systemd
ln -sfn "$RELEASE" "$ROOT/current"
echo "$NEW" | base64 -d > /etc/systemd/system/game-server.service
systemctl daemon-reload && systemctl restart game-server
H=000; S=000
for i in $(seq 1 20); do
  sleep 2
  H=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/health || true)
  S=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:3000/api/client/v1/auth/sso-exchange || true)
  echo "probe#$i health=$H sso=$S"
  if [ "$H" = "200" ] && [ "$S" = "400" ]; then break; fi
done
echo "health=$H sso=$S"
[ "$H" = "200" ] && [ "$S" = "400" ] || { echo "探针未过" && false; }
echo "INIT_OK release=$TS"
`;

function mustRun(cmd) {
  const r = spawnSync(cmd, { shell: true, stdio: 'inherit', cwd: ROOT });
  if (r.status !== 0) process.exit(1);
}

export function initServer() {
  const hash = depsHash();
  const newB64 = Buffer.from(UNIT_NEW).toString('base64');
  const oldB64 = Buffer.from(UNIT_OLD).toString('base64');
  fs.writeFileSync(path.join(ROOT, '.deploy-init.sh'), REMOTE_INIT);
  console.log('▶ 基线探针（当前 dist 必须健康才允许迁移）');
  const base = execSync(`ssh odoo "curl -s -o /dev/null -w %{http_code} http://127.0.0.1:3000/health"`, { encoding: 'utf8' }).trim();
  if (base !== '200') { console.error(`✗ 基线 health=${base}，先修复再迁移`); process.exit(1); }
  console.log('▶ 上传并执行迁移脚本');
  mustRun(`scp .deploy-init.sh odoo:/tmp/gs-init.sh`);
  mustRun(`ssh odoo "bash /tmp/gs-init.sh ${newB64} ${oldB64} ${hash}"`);
  console.log('✓ 服务器已迁移到 releases + current');
}

// ---------- 以下为执行入口（测试导入不触发） ----------
const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const cmd = argv.find((a) => !a.startsWith('--')) || 'deploy';
  if (cmd === 'init-server') initServer();
  else { console.error('deploy 子命令在 Task 3 实现'); process.exit(1); }
}
