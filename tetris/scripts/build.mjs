/**
 * esbuild 构建脚本（替代 package.json 内联命令）
 * 读取项目根目录 .env，注入构建期环境变量；打包 src/Main.ts → bin/bundle.js（IIFE）。
 */

import { build, context } from "esbuild";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

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
  "process.env.GAME_SERVER_API_URL": JSON.stringify(env.GAME_SERVER_API_URL || ""),
  "process.env.SSO_LOGIN_URL": JSON.stringify(env.SSO_LOGIN_URL || ""),
  "process.env.SSO_APP_CODE": JSON.stringify(env.SSO_APP_CODE || ""),
  "process.env.SITE_URL": JSON.stringify(env.SITE_URL || ""),
  "process.env.MARKETING_API_BASE": JSON.stringify(env.MARKETING_API_BASE || ""),
  "process.env.MARKETING_CAMPAIGN_CODE": JSON.stringify(env.MARKETING_CAMPAIGN_CODE || ""),
};

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
  const ctx = await context(commonOptions);
  await ctx.watch();
  console.log("[build] watching for changes… (Ctrl+C to stop)");
} else {
  await build(commonOptions);
  console.log(`[build] bundled in ${Date.now() - start}ms → bin/bundle.js`);
}
