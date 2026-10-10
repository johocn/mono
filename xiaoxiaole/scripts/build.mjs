/**
 * esbuild 构建脚本（替代 package.json 内联命令）
 *
 * 作用：
 *   1. 读取项目根目录 .env，注入构建期环境变量（process.env.VENDURE_*）
 *   2. 打包 src/Main.ts → bin/bundle.js（IIFE，浏览器）
 *   3. 支持 --watch（开发模式，不压缩）
 *
 * 注入方式：esbuild `define` 会把源码中「完整的字面量」
 * `process.env.VENDURE_API_URL` 替换为字符串常量，运行时不依赖 process 全局。
 */

import { build, context } from "esbuild";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

/** 简易 .env 解析（兼容 KEY=VALUE，支持引号包裹与 # 注释） */
function loadEnv() {
  const env = {};
  const path = join(root, ".env");
  if (!existsSync(path)) return env;
  const text = readFileSync(path, "utf8");
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([\w.]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[m[1]] = v;
  }
  return env;
}

const env = loadEnv();
const watch = process.argv.includes("--watch");
const minify = !watch;

const define = {
  "process.env.VENDURE_API_URL": JSON.stringify(env.VENDURE_API_URL || ""),
  "process.env.VENDURE_STOREFRONT_URL": JSON.stringify(
    env.VENDURE_STOREFRONT_URL || "https://shop.braingarden.example",
  ),
  "process.env.VENDURE_CHANNEL_TOKEN": JSON.stringify(env.VENDURE_CHANNEL_TOKEN || ""),
  // 消消乐后端（game-server）：缺省即本地模式，云端能力降级但游戏完整可玩
  "process.env.GAME_SERVER_API_URL": JSON.stringify(env.GAME_SERVER_API_URL || ""),
  // SSO 统一登录：缺省走 Env.ts 内置默认（h.joho.cn + game-xxl），无需在 .env 重复配置
  "process.env.SSO_LOGIN_URL": JSON.stringify(env.SSO_LOGIN_URL || ""),
  "process.env.SSO_APP_CODE": JSON.stringify(env.SSO_APP_CODE || ""),
  "process.env.SITE_URL": JSON.stringify(env.SITE_URL || ""),
  // 上线开关：强制 SSO 登录（缺省放行游客）；必须与 Env.ts 中 process.env.FORCE_SSO_LOGIN 一致，
  // 否则该字面量会残留到产物里，浏览器中报“process is not defined”导致整站无法启动
  "process.env.FORCE_SSO_LOGIN": JSON.stringify(env.FORCE_SSO_LOGIN || ""),
  // 营销 A/B（Strapi zhao-studio / zhao-track）：缺省为空 = 自动跳过，游戏保持原分享逻辑
  "process.env.MARKETING_API_BASE": JSON.stringify(env.MARKETING_API_BASE || ""),
  "process.env.MARKETING_CAMPAIGN_CODE": JSON.stringify(env.MARKETING_CAMPAIGN_CODE || ""),
  // 家属同步（周报/未练习状态上报）：缺省为空 = 纯离线，不上传任何数据
  "process.env.FAMILY_SYNC_API_URL": JSON.stringify(env.FAMILY_SYNC_API_URL || ""),
};

/**
 * 构建后给 bin/index.html 里的 ./bundle.js 打上版本号（?v=时间戳）。
 * 解决「改了代码、刷新浏览器却还是旧页面」：http-server 默认会带缓存，
 * 即便带 -c-1，部分浏览器/网关仍可能命中强缓存；加唯一串后可确保每次拉新。
 * 幂等：重复构建只会替换已存在的 ?v=xxx。
 */
function stampIndex() {
  const idxPath = join(root, "bin/index.html");
  if (!existsSync(idxPath)) return;
  const ver = Date.now().toString(36);
  const html = readFileSync(idxPath, "utf8");
  const next = html.replace(/src="\.\/bundle\.js(\?v=[A-Za-z0-9]+)?"/g, `src="./bundle.js?v=${ver}"`);
  if (next !== html) writeFileSync(idxPath, next);
}

const start = Date.now();
const commonOptions = {
  entryPoints: [join(root, "src/Main.ts")],
  bundle: true,
  format: "iife",
  outfile: join(root, "bin/bundle.js"),
  platform: "browser",
  target: "es2020",
  minify,
  sourcemap: !minify,
  define,
  logLevel: "info",
};

if (watch) {
  // esbuild 0.21 的 build() 不接受 watch 选项，需用 context API
  const ctx = await context(commonOptions);
  await ctx.watch();
  stampIndex();
  console.log("[build] watching for changes… (Ctrl+C to stop)");
} else {
  await build(commonOptions);
  stampIndex();
  console.log(`[build] bundled in ${Date.now() - start}ms → bin/bundle.js`);
}
