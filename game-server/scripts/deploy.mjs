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

// ---------- 本地产物破坏（仅 --selftest-* 演练用） ----------
function collectFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...collectFiles(p));
    else out.push(p);
  }
  return out;
}
function corruptPackage() {
  // 必须覆盖 dist 全部文本文件（.js/.js.map/.d.ts/tsbuildinfo）：
  // sourcemap/声明文件内嵌 TS 源码仍含 sso-exchange 字样，服务端 grep -rq 全文件预检会放行
  for (const f of collectFiles(path.join(ROOT, 'dist'))) {
    const t = fs.readFileSync(f, 'utf8');
    // 注意：替换目标不能包含 'sso-exchange' 子串（sso-exchanged 仍会被 grep 命中）
    if (t.includes('sso-exchange')) fs.writeFileSync(f, t.split('sso-exchange').join('sso-exch4nged'));
  }
}
function corruptRuntime() {
  const mainJs = path.join(ROOT, 'dist', 'src', 'main.js');
  fs.writeFileSync(mainJs, 'process.exit(1);\n' + fs.readFileSync(mainJs, 'utf8'));
}

const REMOTE_DEPLOY = `#!/usr/bin/env bash
set -euo pipefail
ROOT=/opt/game-server
PREV=$(readlink -f "$ROOT/current" 2>/dev/null || true)
TS=$(date +%Y%m%d-%H%M%S)
RELEASE=$ROOT/releases/$TS
rollback() {
  echo "↩ 探针未过，自动回滚 -> $PREV"
  [ -z "$PREV" ] && { echo "✗ 无上一版可回滚"; exit 2; }
  ln -sfn "$PREV" "$ROOT/current"
  systemctl restart game-server
  for i in $(seq 1 20); do
    sleep 2
    RC=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/health || true)
    echo "revert-probe#$i health=$RC"
    if [ "$RC" = "200" ]; then break; fi
  done
  curl -s -o /dev/null -w "revert-health=%{http_code}\\n" http://127.0.0.1:3000/health
}
echo "$PREV" | grep -q releases || { echo "✗ current 未指向 releases（先 init-server）"; exit 2; }
mkdir -p "$RELEASE"
tar -xzf /tmp/gs-dist.tgz -C "$RELEASE"
HASH=$(cat "$RELEASE/.deps-hash")
OLD=$(cat "$ROOT/.deps-hash" 2>/dev/null || true)
if [ "$HASH" != "$OLD" ]; then
  echo "▶ 依赖变更 -> npm ci --omit=dev"
  ( cd "$ROOT" && npm ci --omit=dev --no-audit --no-fund )
  echo "$HASH" > "$ROOT/.deps-hash"
fi
grep -rq sso-exchange "$RELEASE/dist/src" || { echo "✗ 预检:缺 sso-exchange（疑似旧包），未切换"; exit 1; }
grep -rq health "$RELEASE/dist/src" || { echo "✗ 预检:缺 health，未切换"; exit 1; }
( cd "$RELEASE/dist/src" && node -e "require.resolve('@nestjs/core')" ) || { echo "✗ 预检:共享 node_modules 不可达"; exit 1; }
ln -sfn "$RELEASE" "$ROOT/current"
systemctl restart game-server
H=000; S=000
for i in $(seq 1 20); do
  sleep 2
  H=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/health || true)
  S=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:3000/api/client/v1/auth/sso-exchange || true)
  echo "probe#$i health=$H sso=$S"
  if [ "$H" = "200" ] && [ "$S" = "400" ]; then break; fi
done
echo "health=$H sso=$S"
if [ "$H" != "200" ] || [ "$S" != "400" ]; then rollback; exit 1; fi
cd "$ROOT/releases" && ls -1d */ 2>/dev/null | sed 's:/$::' | sort | head -n -5 | xargs -r rm -rf
echo "DEPLOY_OK release=$TS"
`;

export function deploy(kind = null) {
  fs.mkdirSync(path.join(ROOT, '.deploy'), { recursive: true });
  console.log('▶ nest build'); mustRun('npm run build');
  const c = checkDist(path.join(ROOT, 'dist'));
  if (!c.ok) { console.error(`✗ 本地自检失败，缺: ${c.missing.join(',')}`); process.exit(1); }
  console.log('✓ 本地自检通过（sso-exchange / health）');
  if (kind === 'package') { corruptPackage(); console.log('⚠ selftest 包已破坏（预期服务端预检拦截）'); }
  if (kind === 'runtime') { corruptRuntime(); console.log('⚠ selftest 运行时已破坏（预期探针失败自动回滚）'); }
  fs.writeFileSync(path.join(ROOT, '.deps-hash'), depsHash());
  console.log('▶ tar 打包'); mustRun('tar -czf .deploy/gs-dist.tgz dist seeds .deps-hash');
  fs.rmSync(path.join(ROOT, '.deps-hash'));
  console.log('▶ scp 上传'); mustRun('scp .deploy/gs-dist.tgz odoo:/tmp/gs-dist.tgz');
  fs.writeFileSync(path.join(ROOT, '.deploy', 'remote.sh'), REMOTE_DEPLOY);
  mustRun('scp .deploy/remote.sh odoo:/tmp/gs-remote.sh');
  console.log('▶ 服务器: 解压/预检/切换/重启/探针');
  const r = spawnSync('ssh odoo "bash /tmp/gs-remote.sh"', { shell: true, stdio: 'inherit', cwd: ROOT });
  if (r.status !== 0) { console.error('✗ 发布失败（服务端已自动回滚或未切换）'); process.exit(1); }
}

// ---------- 以下为执行入口（测试导入不触发） ----------
const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const cmd = argv.find((a) => !a.startsWith('--')) || 'deploy';
  if (cmd === 'init-server') initServer();
  else if (cmd === 'deploy') deploy(argv.includes('--selftest-bad-package') ? 'package' : argv.includes('--selftest-bad-runtime') ? 'runtime' : null);
  else { console.error('用法: node scripts/deploy.mjs [deploy|init-server] [--selftest-bad-package|--selftest-bad-runtime]'); process.exit(1); }
}
