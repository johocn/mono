/**
 * 轻量拉取 Cubism 资产：经 GitHub tree API 拿到清单后，逐个抓取
 * Core/live2dcubismcore.min.js 与 Samples/Resources/Hiyori 全部文件到 vendor/。
 * 避免整仓克隆（Samples 含大量样本模型，体积过大）。
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

const REPO = "Live2D/CubismWebSamples";
const BRANCH = "develop";
const PROXY = "https://ghproxy.net";
const APIS = [`${PROXY}/https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`, `https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`];
const RAWS = [`${PROXY}/https://raw.githubusercontent.com/${REPO}/${BRANCH}`, `https://raw.githubusercontent.com/${REPO}/${BRANCH}`];

async function getTree() {
  for (const u of APIS) {
    try {
      const r = await fetch(u, { headers: { "User-Agent": "node" } });
      if (r.ok) return await r.json();
      console.log("tree status", r.status, u);
    } catch (e) {
      console.log("tree err", u, e.message);
    }
  }
  throw new Error("tree fetch failed");
}

async function fetchFile(rel) {
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    for (const base of RAWS) {
      try {
        const r = await fetch(`${base}/${rel}`);
        if (r.ok) return Buffer.from(await r.arrayBuffer());
        lastErr = `${r.status} ${base}/${rel}`;
      } catch (e) {
        lastErr = e.message;
      }
    }
    if (attempt < 3) await new Promise((s) => setTimeout(s, 800 * (attempt + 1)));
  }
  throw new Error("fetch fail " + lastErr);
}

const want = (p) => /^Core\/live2dcubismcore\.min\.js$/.test(p) || /^Samples\/Resources\/Hiyori\//.test(p);

async function main() {
  const tree = await getTree();
  const items = tree.tree.filter((t) => t.type === "blob" && want(t.path));
  console.log("待抓取文件数:", items.length);
  let n = 0;
  for (const it of items) {
    const rel = it.path;
    const out = rel.startsWith("Core/")
      ? join("vendor", rel)
      : join("vendor", rel.replace(/^Samples\/Resources\//, ""));
    const buf = await fetchFile(rel);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, buf);
    n++;
    console.log(`ok [${n}/${items.length}] ${out} (${buf.length}B)`);
  }
  console.log("DONE");
}

main().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
