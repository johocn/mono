# game-server 原子发布部署（方案 A）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地 [部署协议.md](../../../部署协议.md) 的目标态——`scripts/deploy.mjs` 唯一部署入口 + 服务器 `releases/<ts>` + `current` symlink 原子发布，根治「多套构建互相覆盖 dist」事故。

**Architecture:** 本地 `nest build` → 产物自检（grep `sso-exchange`/`health`）→ tar（仅 dist/seeds/依赖指纹，**绝无 .env\*/node_modules**）→ scp → 服务器解压到 `releases/<yyyyMMdd-HHmmss>/` → 服务端预检 + 共享 node_modules 解析预检 → symlink 原子切换 → restart → 双探针（`/health`=200、`POST /api/client/v1/auth/sso-exchange`=400）→ 失败自动回滚上一版。保留最近 5 版。

**Tech Stack:** Node ≥18（ESM + node:test）、Windows bsdtar、OpenSSH（ssh/scp）、远端 bash、systemd、curl 探针。

**关键环境事实：**
- 本地仓 `d:\zhao\game-server`（mono 大仓子目录，push 到 github.com:johocn/mono.git）
- 服务器 `ssh odoo`（root@39.106.99.9），应用根 `/opt/game-server`，systemd 单元 `/etc/systemd/system/game-server.service`（`WorkingDirectory=/opt/game-server`，现 `ExecStart=/usr/local/bin/node dist/src/main`，dotenv 从 cwd 读 `.env`/`.env.prod`）
- 健康端点 `GET /health`（`src/health/health.controller.ts`，无全局前缀）；SSO 探针 `POST /api/client/v1/auth/sso-exchange`（400=路由在，404 Cannot POST=旧包）
- 共享 node_modules 解析原理：Node 按 **realpath** 向上找模块——`releases/<ts>/dist/src/main.js` 的 realpath 向上遍历可达 `/opt/game-server/node_modules`（`current` 是 symlink 不影响）
- PowerShell 环境跑命令用 `;` 不用 `&&`；远端脚本一律本地生成文件 → scp → `bash` 执行，杜绝引号转义

---

### Task 1: deploy.mjs 纯函数核心（TDD）

**Files:**
- Create: `scripts/deploy.mjs`
- Test: `tests/deploy.checkdist.test.mjs`

- [ ] **Step 1: 写失败测试**

```js
// tests/deploy.checkdist.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkDist, depsHash } from '../scripts/deploy.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gs-dist-'));

test('checkDist: 两个标记都在 → ok', () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'a.js'), "router.post('/api/client/v1/auth/sso-exchange'");
  fs.writeFileSync(path.join(dir, 'src', 'b.js'), "Controller('health')");
  assert.deepEqual(checkDist(dir), { ok: true, missing: [] });
});

test('checkDist: 缺标记 → 报缺', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'x.js'), 'nothing here');
  assert.deepEqual(checkDist(dir), { ok: false, missing: ['sso-exchange', 'health'] });
});

test('depsHash: 与键顺序无关且稳定', () => {
  const f1 = path.join(tmp(), 'p.json'), f2 = path.join(tmp(), 'p.json');
  fs.writeFileSync(f1, JSON.stringify({ dependencies: { b: '1.0.0', a: '2.0.0' } }));
  fs.writeFileSync(f2, JSON.stringify({ dependencies: { a: '2.0.0', b: '1.0.0' } }));
  assert.equal(depsHash(f1), depsHash(f2));
  assert.match(depsHash(f1), /^[0-9a-f]{32}$/);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/deploy.checkdist.test.mjs`
Expected: FAIL（`Cannot find module '../scripts/deploy.mjs'`）

- [ ] **Step 3: 实现纯函数**

```js
// scripts/deploy.mjs
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/deploy.checkdist.test.mjs`
Expected: 3 pass

- [ ] **Step 5: 提交**

```bash
git add scripts/deploy.mjs tests/deploy.checkdist.test.mjs
git commit -m "feat(deploy): deploy.mjs 产物自检/依赖指纹纯函数（TDD）"
```

---

### Task 2: init-server 子命令——一次性服务器迁移

**Files:**
- Modify: `scripts/deploy.mjs`（追加 systemd 单元常量、远端脚本生成、`initServer()`、入口分发）

- [ ] **Step 1: 追加代码**

在 `depsHash` 之后追加（`NEEDLES`/`ROOT` 沿用 Task 1）：

```js
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
  sleep 5
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
sleep 5
H=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/health || true)
S=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:3000/api/client/v1/auth/sso-exchange || true)
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
```

入口分发（替换 Task 1 的 `if (isMain)` 占位）：

```js
if (isMain) {
  const argv = process.argv.slice(2);
  const cmd = argv.find((a) => !a.startsWith('--')) || 'deploy';
  if (cmd === 'init-server') initServer();
  else { console.error('deploy 子命令在 Task 3 实现'); process.exit(1); }
}
```

- [ ] **Step 2: 语法与单测回归**

Run: `node --check scripts/deploy.mjs ; node --test tests/deploy.checkdist.test.mjs`
Expected: 无输出错误 + 3 pass

- [ ] **Step 3: 执行迁移**

Run: `node scripts/deploy.mjs init-server`
Expected: 输出 `health=200 sso=400` 与 `INIT_OK release=<ts>`

- [ ] **Step 4: 服务器状态核验**

```bash
ssh odoo "readlink /opt/game-server/current"
ssh odoo "systemctl cat game-server | grep ExecStart"
ssh odoo "ls /opt/game-server/releases"
ssh odoo "curl -s -o /dev/null -w %{http_code} http://127.0.0.1:3000/health"
```
Expected: current 指向 releases/<ts>；`ExecStart=/usr/local/bin/node current/dist/src/main`；health=200

- [ ] **Step 5: 消消乐全链路 E2E**

Run: `python d:\zhao\xiaoxiaole\tools\e2e_sso.py`
Expected: `E2E_OK`

- [ ] **Step 6: 提交**

```bash
git add scripts/deploy.mjs
git commit -m "feat(deploy): init-server 一次性迁移——releases/current/systemd 切换与失败回退"
```

---

### Task 3: deploy 主流程——构建/上传/原子切换/自动回滚/自演练

**Files:**
- Modify: `scripts/deploy.mjs`（追加 corrupt/tar/upload/远端发布脚本与 `deploy()`、`--selftest-*` 支持）

- [ ] **Step 1: 追加代码**

```js
// ---------- 本地产物破坏（仅 --selftest-* 演练用） ----------
function collectJs(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...collectJs(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}
function corruptPackage() {
  for (const f of collectJs(path.join(ROOT, 'dist'))) {
    const t = fs.readFileSync(f, 'utf8');
    if (t.includes('sso-exchange')) fs.writeFileSync(f, t.split('sso-exchange').join('sso-exchanged'));
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
  sleep 5
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
sleep 5
H=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/health || true)
S=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:3000/api/client/v1/auth/sso-exchange || true)
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
  fs.writeFileSync(path.join(ROOT, '.deploy', '.deps-hash'), depsHash());
  console.log('▶ tar 打包'); mustRun('tar -czf .deploy/gs-dist.tgz dist seeds .deploy/.deps-hash');
```

注意 tar 路径：`.deploy/.deps-hash` 会以该相对路径进包——改为在 ROOT 下生成 `.deps-hash` 再打包后删除更简单，远端解出的文件名须为 `.deps-hash`（tar 顶层）。修正为：

```js
  fs.writeFileSync(path.join(ROOT, '.deps-hash'), depsHash());
  mustRun('tar -czf .deploy/gs-dist.tgz dist seeds .deps-hash');
  fs.rmSync(path.join(ROOT, '.deps-hash'));
  console.log('▶ scp 上传'); mustRun('scp .deploy/gs-dist.tgz odoo:/tmp/gs-dist.tgz');
  fs.writeFileSync(path.join(ROOT, '.deploy', 'remote.sh'), REMOTE_DEPLOY);
  mustRun('scp .deploy/remote.sh odoo:/tmp/gs-remote.sh');
  console.log('▶ 服务器: 解压/预检/切换/重启/探针');
  const r = spawnSync('ssh odoo "bash /tmp/gs-remote.sh"', { shell: true, stdio: 'inherit', cwd: ROOT });
  if (r.status !== 0) { console.error('✗ 发布失败（服务端已自动回滚或未切换）'); process.exit(1); }
}
```

入口分发改为：

```js
if (isMain) {
  const argv = process.argv.slice(2);
  const cmd = argv.find((a) => !a.startsWith('--')) || 'deploy';
  if (cmd === 'init-server') initServer();
  else if (cmd === 'deploy') deploy(argv.includes('--selftest-bad-package') ? 'package' : argv.includes('--selftest-bad-runtime') ? 'runtime' : null);
  else { console.error('用法: node scripts/deploy.mjs [deploy|init-server] [--selftest-bad-package|--selftest-bad-runtime]'); process.exit(1); }
}
```

- [ ] **Step 2: 回归**

Run: `node --check scripts/deploy.mjs ; node --test tests/deploy.checkdist.test.mjs`
Expected: 3 pass

- [ ] **Step 3: 首次真实发布**

Run: `node scripts/deploy.mjs`
Expected: `health=200 sso=400` + `DEPLOY_OK release=<新ts>`；`ssh odoo "readlink /opt/game-server/current"` 已变
注意：本机 `d:\zhao\game-server` 的源码即当前线上同源（本地 dist 恒含 SSO），首次发布产物 = 当前版本 +1

- [ ] **Step 4: 演练①——坏包被预检拦截**

Run: `node scripts/deploy.mjs --selftest-bad-package`
Expected: `✗ 预检:缺 sso-exchange（疑似旧包），未切换`，退出码 1；`ssh odoo "readlink /opt/game-server/current"` **未变**；探针仍 200/400

- [ ] **Step 5: 演练②——运行时崩溃自动回滚**

Run: `node scripts/deploy.mjs --selftest-bad-runtime`
Expected: `health=502/000` → `↩ 探针未过，自动回滚` → `revert-health=200`，退出码 1；readlink 回到演练①之前的版本；探针 200/400

- [ ] **Step 6: 提交**

```bash
git add scripts/deploy.mjs
git commit -m "feat(deploy): deploy 主流程——tar/scp/原子切换/双探针/自动回滚/自演练开关"
```

---

### Task 4: 文档收口——协议目标态生效 + README 指引

**Files:**
- Modify: `部署协议.md`（第三节标题后加生效声明；「部署记录」追加行）
- Modify: `README.md`（部署章节指引）

- [ ] **Step 1: 协议更新**

第三节标题改为 `## 三、目标态布局（已于 2026-10-07 生效）`，首行下追加：
`> 迁移已完成：current 已指向 releases/<ts>，systemd ExecStart=node current/dist/src/main。dist 目录已改名 dist_pre_atomic_<ts>，禁止再写入。`
「部署记录」表追加：

```markdown
| 2026-10-07 | AI 会话 | init-server 迁移 + 首次原子发布 + 演练①② | 预检拦截 ✓ / 自动回滚 ✓ |
```

- [ ] **Step 2: README 部署指引**

在 `README.md` 顶部目录区追加一行：

```markdown
> 部署本服务前必读 [部署协议.md](./部署协议.md)，唯一入口 `node scripts/deploy.mjs`。
```

- [ ] **Step 3: 提交推送**

```bash
git add 部署协议.md README.md
git commit -m "docs(部署): 目标态生效声明 + README 部署必读指引"
git push
```

---

## Self-Review 结论

- **Spec 覆盖**：协议五节 ↔ Task 对齐——铁律1（禁服务器构建：仅 npm ci，Task 2/3 脚本内）、铁律2/3（tar 白名单 + dist 让位，Task 2/3）、铁律4（双自检本地+服务端，Task 1/2/3）、铁律5（唯一入口，Task 3）；app_code 规则无需代码（协议既有）；回滚（Task 3 演练②）；部署记录（Task 4）
- **占位符**：无 TBD/TODO；所有代码块完整
- **命名一致**：`checkDist`/`depsHash`/`scanNeedles`/`initServer`/`deploy`/`UNIT_NEW/OLD`/`REMOTE_INIT/DEPLOY` 各 Task 引用一致；远端依赖指纹文件统一 `.deps-hash`
- **已知留痕**：`.deploy/`、`.deploy-init.sh` 为本地临时产物，加入 `.gitignore`（Task 3 Step 6 一并 `git add .gitignore`，行内容：`.deploy/` 与 `.deploy-init.sh`）
