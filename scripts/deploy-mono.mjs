#!/usr/bin/env node
/*
 * 大富翁 · 吉林双阳 —— M7 部署脚本（spec §11.7）
 *
 * 铁律：本地构建 → tar 整包 → scp → 服务器仅解压/备份；**绝不在服务器构建**
 * （服务器无本工程 node_modules，线上构建既慢又不可复现）。
 *
 * 七步契约：
 *   1 本地构建    cwd=monopoly 执行 `npm run build`，失败即 exit(1)
 *   2 打包        `tar -czf <tmp>/mono-<ts>.tgz -C monopoly/release .`（含 html/js/assets/skins）
 *   3 备份远程    `cp -r <ROOT> <ROOT>.bak-<ts>`，仅保留最近 3 份（多余的删）
 *   4 上传        `scp <tgz> odoo:/tmp/mono-<ts>.tgz`
 *   5 解压        `ssh odoo "mkdir -p <ROOT> && tar -xzf /tmp/mono-<ts>.tgz -C <ROOT>"`
 *   6 校验        mono.html 200；js/mono.js 线上字节数 == 本地；skins/photo/skin.json 200
 *   7 输出        打印 ROOT / ts / 备份路径 / 三项校验结果
 *
 * 用法：`node scripts/deploy-mono.mjs [--dry]`（--dry 只做 1+2 并打印远程命令，不连服务器）
 *
 * 环境适配说明：远程校验用 Node 内置 `fetch`（Node 22），而非计划里的 `curl | wc -c`
 * —— Windows 无 `wc`，且 `curl` 是 PowerShell 别名；fetch 跨平台且可直接比较字节数。
 */
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HOST = 'odoo';
const ROOT = '/opt/1panel/apps/openresty/openresty/www/sites/game.joho.cn/tour';
const ORIGIN = 'https://game.joho.cn/tour';
const KEEP_BAK = 3;

const HERE = dirname(fileURLToPath(import.meta.url));
const MONO_DIR = resolve(HERE, '..', 'monopoly');
const RELEASE = join(MONO_DIR, 'release');

const dry = process.argv.includes('--dry');
const pad = (n) => String(n).padStart(2, '0');
const d = new Date();
const TS = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

const TGZ = join(tmpdir(), `mono-${TS}.tgz`);
const REMOTE_TGZ = `/tmp/mono-${TS}.tgz`;
const BAK = `${ROOT}.bak-${TS}`;

const log = (s) => console.log(s);
const step = (n, title) => log(`\n===== 步骤 ${n} / 7 · ${title} =====`);

/** 同步执行外部命令（execFile 传数组，规避 Windows cmd 引号地狱）。 */
function run(file, args, { cwd, inherit = false, shell = false } = {}) {
  return execFileSync(file, args, {
    cwd,
    shell,
    stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
}

/** 步骤 1：本地构建（`npm run build`）。
 *  Windows 上若经 `cmd.exe` 间接 spawn npm，vite 会因 cwd 大小写/进程上下文差异抛
 *  `[vite:html-inline-proxy] No matching HTML proxy module found`（已实测复现）；
 *  改用 PowerShell 直接调用 `npm run build` 即稳（等价命令），不碰 cmd。 */
function build() {
  if (process.platform === 'win32') {
    run('powershell.exe', ['-NoProfile', '-Command', 'npm run build'], { cwd: MONO_DIR, inherit: true });
  } else {
    run('npm', ['run', 'build'], { cwd: MONO_DIR, inherit: true });
  }
}

/* ---- 步骤 1：本地构建 ---- */
step(1, '本地构建');
log(`cwd = ${MONO_DIR}`);
build();
log('[deploy] 本地构建成功');

/* ---- 步骤 2：打包整包 ---- */
step(2, '打包（tar 整包）');
run('tar', ['-czf', TGZ, '-C', RELEASE, '.']);
const tgzBytes = statSync(TGZ).size;
log(`tgz = ${TGZ}（${tgzBytes} bytes）`);

/* ---- 步骤 3–6 的远程命令（dry 时打印，不执行） ---- */
const backupCmd = `mkdir -p '${ROOT}' && cp -r '${ROOT}' '${BAK}' && ls -1dt '${ROOT}.bak-'* 2>/dev/null | tail -n +${KEEP_BAK + 1} | xargs -r rm -rf`;
const extractCmd = `mkdir -p '${ROOT}' && tar -xzf '${REMOTE_TGZ}' -C '${ROOT}' && rm -f '${REMOTE_TGZ}'`;

if (dry) {
  step(3, '（dry）备份远程');
  log(`ssh ${HOST} "${backupCmd}"`);
  step(4, '（dry）上传');
  log(`scp '${TGZ}' ${HOST}:${REMOTE_TGZ}`);
  step(5, '（dry）服务器解压');
  log(`ssh ${HOST} "${extractCmd}"`);
  step(6, '（dry）校验');
  log(`GET ${ORIGIN}/mono.html → 期望 200`);
  log(`GET ${ORIGIN}/js/mono.js 字节数 == 本地 ${statSync(join(RELEASE, 'js', 'mono.js')).size}`);
  log(`GET ${ORIGIN}/skins/photo/skin.json → 期望 200`);
  log(`\n[dry] 未连接服务器。TGZ 已生成：${TGZ}`);
  process.exit(0);
}

/* ---- 步骤 3：备份远程（保留最近 KEEP_BAK 份） ---- */
step(3, '备份远程（保留最近 3 份）');
run('ssh', ['-o', 'BatchMode=yes', HOST, backupCmd]);
const baks = run('ssh', ['-o', 'BatchMode=yes', HOST, `ls -1dt '${ROOT}.bak-'* 2>/dev/null | head -n ${KEEP_BAK}`])
  .trim().split('\n').filter(Boolean);
log(`新备份：${BAK}`);
log(`现存备份（≤${KEEP_BAK}）：\n  ${baks.join('\n  ')}`);

/* ---- 步骤 4：上传 ---- */
step(4, '上传（scp）');
run('scp', ['-o', 'BatchMode=yes', TGZ, `${HOST}:${REMOTE_TGZ}`]);
log(`已上传 ${REMOTE_TGZ}`);

/* ---- 步骤 5：服务器解压 ---- */
step(5, '服务器解压');
run('ssh', ['-o', 'BatchMode=yes', HOST, extractCmd]);
log(`已解压到 ${ROOT}`);

/* ---- 步骤 6：校验（fetch：200 / 字节数 / skin.json） ---- */
step(6, '线上校验');
const localJsBytes = statSync(join(RELEASE, 'js', 'mono.js')).size;
const headRes = await fetch(`${ORIGIN}/mono.html`);
const httpOk = headRes.status === 200;
const jsRes = await fetch(`${ORIGIN}/js/mono.js`);
const remoteJsBytes = (await jsRes.arrayBuffer()).byteLength;
const bytesOk = remoteJsBytes === localJsBytes;
const skinRes = await fetch(`${ORIGIN}/skins/photo/skin.json`);
const skinOk = skinRes.status === 200;

log(`① ${ORIGIN}/mono.html            → ${headRes.status} ${httpOk ? '✅' : '❌'}`);
log(`② js/mono.js 线上/本地字节数      → ${remoteJsBytes} / ${localJsBytes} ${bytesOk ? '✅' : '❌'}`);
log(`③ skins/photo/skin.json          → ${skinRes.status} ${skinOk ? '✅' : '❌'}`);

/* ---- 步骤 7：总结 ---- */
step(7, '总结');
log(JSON.stringify({
  ROOT,
  ts: TS,
  tgz: TGZ,
  backup: BAK,
  backupsKept: baks,
  live: `${ORIGIN}/mono.html`,
  check: { monoHtml200: httpOk, jsBytesMatch: bytesOk, skinPhoto200: skinOk },
}, null, 2));

if (!(httpOk && bytesOk && skinOk)) {
  console.error('[deploy] 线上校验未全部通过');
  process.exit(1);
}
log('\n[deploy] 全部通过 ✅');
