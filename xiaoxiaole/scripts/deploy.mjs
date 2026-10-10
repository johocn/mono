/**
 * 一键部署脚本（唯一部署入口）
 *
 * 铁律：bundle.js 与 index.html 必须成对部署。
 *   本地 .env 处于本地预览模式时（GAME_SERVER_API_URL / FORCE_SSO_LOGIN 置空），
 *   重构建的 bundle 里这些值为空，线上配置全靠 index.html 的 window.__APP_ENV__
 *   运行时注入——只换 bundle 不换 index.html 会丢 SSO 强制登录和后端连接。
 *   本脚本永远成对上传，堵死这个坑；请勿手工单独 scp bundle.js。
 *
 * 流程：本地构建（typecheck + esbuild + 版本戳）→ 服务器备份 .bak_<ts>
 *   → 成对上传 → 双域入口校验版本戳与字节数 → 打印回滚提示。
 *
 * 用法：node scripts/deploy.mjs
 */

import { execSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// ── 部署目标（odoo 服务器，静态目录为 game.joho.cn 站点目录，yourbao 域 /tour/ 同源别名共享）──
const SSH_ALIAS = "odoo";
const REMOTE_DIR = "/opt/1panel/apps/openresty/openresty/www/sites/game.joho.cn/tour/xxl";
const CHECK_URLS = ["https://game.yourbao.cn/tour/xxl/", "https://game.joho.cn/tour/xxl.html"];

const sh = (cmd) => execSync(cmd, { stdio: ["ignore", "pipe", "inherit"] }).toString().trim();
const ssh = (cmd) => sh(`ssh ${SSH_ALIAS} "${cmd.replace(/"/g, '\\"')}"`);

// 1. 本地构建（含 typecheck，失败即中断）
console.log("[1/4] 本地构建（typecheck + esbuild + 版本戳）…");
execSync("npm run build", { cwd: root, stdio: "inherit" });

const bundlePath = join(root, "bin", "bundle.js");
const indexPath = join(root, "bin", "index.html");
const bundleSize = statSync(bundlePath).size;
const html = readFileSync(indexPath, "utf8");
const stamp = (html.match(/bundle\.js\?v=([A-Za-z0-9]+)/) || [])[1];
if (!stamp) {
  console.error("[deploy] index.html 缺少 ?v= 版本戳，构建产物异常，中止");
  process.exit(1);
}
console.log(`      bundle ${bundleSize}B，版本戳 v=${stamp}`);

// 2. 服务器备份（成对）
console.log("[2/4] 备份服务器当前版本…");
const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
ssh(`cd ${REMOTE_DIR} && cp -a bundle.js bundle.js.bak_deploy_${ts} && cp -a index.html index.html.bak_deploy_${ts}`);

// 3. 成对上传（永远两个文件一起）
console.log("[3/4] 成对上传 bundle.js + index.html…");
sh(`scp ${bundlePath} ${indexPath} ${SSH_ALIAS}:${REMOTE_DIR}/`);

// 4. 双域校验：入口返回新版本戳 + 线上 bundle 字节数一致
console.log("[4/4] 双域校验…");
let ok = true;
for (const url of CHECK_URLS) {
  try {
    const body = sh(`curl -sk ${url}`);
    const hit = body.includes(`bundle.js?v=${stamp}`);
    console.log(`      ${url} → ${hit ? "版本戳一致" : "版本戳不一致！"}`);
    ok = ok && hit;
  } catch {
    console.log(`      ${url} → 请求失败！`);
    ok = false;
  }
}
const remoteSize = ssh(`wc -c < ${REMOTE_DIR}/bundle.js`);
console.log(`      线上 bundle ${remoteSize}B（本地 ${bundleSize}B）${Number(remoteSize) === bundleSize ? "一致" : "不一致！"}`);
ok = ok && Number(remoteSize) === bundleSize;

console.log(
  ok
    ? `\nDEPLOY_OK  入口：https://game.yourbao.cn/tour/xxl/（回滚：${REMOTE_DIR}/*.bak_deploy_${ts}）`
    : "\nDEPLOY_FAIL  请勿使用本次产物，按上一条备份路径回滚后排查",
);
process.exit(ok ? 0 : 1);
