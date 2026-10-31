/**
 * 发行打包：将 vite 构建产物 dist/ 压缩为 itch.io 可直接上传的 zip。
 * 跨平台：Windows 用 PowerShell Compress-Archive；类 Unix 用 zip。
 * 用法：npm run release  （会先 npm run build 确保 dist 最新）
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const dist = resolve(root, "dist");
const outDir = resolve(root, "release");
const outFile = resolve(outDir, "xiuxian-itch.zip");

if (!existsSync(dist)) {
  console.log("[release] dist/ 不存在，先构建…");
  execSync("npm run build", { cwd: root, stdio: "inherit" });
}

mkdirSync(outDir, { recursive: true });
rmSync(outFile, { force: true });

if (process.platform === "win32") {
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${dist}\\*' -DestinationPath '${outFile}' -Force"`,
    { stdio: "inherit" },
  );
} else {
  execSync(`cd "${dist}" && zip -r "${outFile}" .`, { stdio: "inherit" });
}

const kb = Math.round(existsSync(outFile) ? statSync(outFile).size / 1024 : 0);
console.log(`[release] 已生成：${outFile}  (${kb} KB)`);
console.log("[release] 将本 zip 上传 itch.io（项目类型选 HTML，勾选「This file will be played in the browser」）。");
