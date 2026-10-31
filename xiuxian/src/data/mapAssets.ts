/**
 * 仙侠地图美术素材清单与加载管线（「管线先行 + AI 贴图稍后注入」）。
 *
 * 设计：地图渲染（IsoMap）默认走程序化绘制；本模块登记 AI 文生图贴图的路径与取图接口。
 * 当 MAP_ASSETS_ENABLED 置 true 且 public/assets/ 下存在对应 PNG 时，IsoMap 自动改用贴图，
 * 缺失或禁用时静默回退程序化——保证「无图也能跑、有图即升级」。
 *
 * 资源约定（生成 AI 贴图时请遵循，避免错位）：
 *  - 地面瓦片 assets/tiles/<kind>.png：已烘焙为 2:1 等距菱形（宽 64 × 高 32），四边无缝平铺。
 *  - 建筑/道具精灵 assets/sprites/<kind>.png：等距 billboard，脚底（站立点）位于图像底部中心，
 *    高度不限；绘制时按 (瓦片中心 x - 宽/2, 瓦片中心 y - 高) 贴图，脚底恰好落在格心。
 */
/** 瓦片菱形尺寸（与 IsoMap.TILE_W/H 保持一致；此处本地定义以避免与 IsoMap 形成循环依赖） */
const TILE_W = 64;
const TILE_H = 32;

/** AI 仙侠素材总开关：生成贴图并放入 public/assets/ 后改为 true */
export const MAP_ASSETS_ENABLED = true;

export const TILE_KINDS = ["grass", "path", "water", "sand", "arena", "reef", "portal"] as const;
export const SPRITE_KINDS = ["house", "residence", "smith", "shop", "tree", "wall", "rock", "tuft", "lantern"] as const;
export type TileKindKey = typeof TILE_KINDS[number];
export type SpriteKindKey = typeof SPRITE_KINDS[number];

const ASSET_BASE = "assets"; // public/assets（Vite 以站点根提供）
export function tileURL(kind: string): string { return `${ASSET_BASE}/tiles/${kind}.png`; }
export function spriteURL(kind: string): string { return `${ASSET_BASE}/sprites/${kind}.png`; }

const tileTex: Record<string, any> = {};
const spriteTex: Record<string, any> = {};

/** 取已加载的地面菱形贴图；未就绪返回 null（调用方走程序化回退） */
export function getTileTex(kind: string): any | null { return tileTex[kind] || null; }
/** 取已加载的建筑/道具精灵贴图；未就绪返回 null（调用方走程序化回退） */
export function getSpriteTex(kind: string): any | null { return spriteTex[kind] || null; }

/** 瓦片菱形尺寸（供贴图绘制对齐） */
export const TILE_TEX_W = TILE_W;
export const TILE_TEX_H = TILE_H;

/**
 * 正方形俯视无缝原图 → 64×32 等距菱形（逆等距仿射，保证无缝平铺）。
 * 正向投影 F(a,b)=((a-b)*32,(a+b)*16)，其逆用于把正方形纹理「压」进菱形：
 *   setTransform(32/S, 16/S, -32/S, 16/S, 0, 0) 后 drawImage(src, 0, 0)
 * 返回烘焙后的 dataURL；非浏览器/原图缺失则返回 null（调用方回退程序化）。
 */
function bakeDiamond(src: any): string | null {
  if (typeof document === "undefined" || !src) return null;
  const cvs: any = document.createElement("canvas");
  cvs.width = TILE_W;
  cvs.height = TILE_H;
  const ctx = cvs.getContext("2d");
  if (!ctx) return null;
  const S = src.width || src.sourceWidth || 512;
  ctx.imageSmoothingEnabled = true;
  // 仿射把源正方形压成菱形；菱形顶点为 (32,0)(64,16)(32,32)(0,16)，故需右移 TILE_W/2
  ctx.setTransform((TILE_W / 2) / S, (TILE_H / 2) / S, -(TILE_W / 2) / S, (TILE_H / 2) / S, TILE_W / 2, 0);
  try {
    ctx.drawImage(src, 0, 0);
    return cvs.toDataURL("image/png");
  } catch {
    return null;
  }
}

/** 抠底结果：画布 + 像素（供 bbox 扫描与 dataURL 导出复用） */
interface CutoutResult { cvs: any; img: any; W: number; H: number; }

/**
 * 精灵抠底内核：AI 出图常把「透明」渲染成棋盘格假透明或纸色底。
 * 从四边向内洪水填充（4 连通）：与四角采样背景色相近的像素判为背景置透明，
 * 遇线稿/彩色内容即停——保留建筑白墙等内部浅色。
 */
function cutoutImageData(src: any): CutoutResult | null {
  if (typeof document === "undefined" || !src) return null;
  const W = src.naturalWidth || src.width;
  const H = src.naturalHeight || src.height;
  if (!W || !H) return null;
  const cvs: any = document.createElement("canvas");
  cvs.width = W;
  cvs.height = H;
  const ctx: any = cvs.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(src, 0, 0);
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    const at = (x: number, y: number): number => (y * W + x) * 4;
    // 四角 6×6 均值作为背景色样本（棋盘格双色/纸底都能覆盖）
    const sample = (cx: number, cy: number): number[] => {
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = cy; y < cy + 6; y++) for (let x = cx; x < cx + 6; x++) {
        const i = at(x, y); r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
      }
      return [r / n, g / n, b / n];
    };
    const bgs = [sample(0, 0), sample(W - 6, 0), sample(0, H - 6), sample(W - 6, H - 6)];
    const lum = (c: number[]): number => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
    // 背景越亮容差越大（棋盘格灰白双色、米色纸纹都能吃掉）；
    // 暗底收紧到 60：暗红幕上的脸部阴影/深色矛杆与底色距常落在 60~84，太宽会连主体一起吃
    const T = Math.min(72, Math.max(30, lum(bgs[0]) > 200 ? 52 : 20)) * 3;
    // 色幕保护：背景本身是高饱和纯色（品红/绿幕抠图）时，禁用「高亮低饱和」兜底，
    // 否则白袍等浅色主体会被当成背景啃穿
    const bgSat = Math.max(bgs[0][0], bgs[0][1], bgs[0][2]) - Math.min(bgs[0][0], bgs[0][1], bgs[0][2]);
    // 预抠图检测：四角均已透明（导出脚本产物）→ 跳过键控/羽化，避免二次抠图啃伤主体
    // （透明像素的 RGB 可能残留原幕布色，若再键控会把主体的深色饰边连带吃掉）
    let preCut = true;
    for (const c of [[0, 0], [W - 6, 0], [0, H - 6], [W - 6, H - 6]]) {
      let a = 0, n = 0;
      for (let y = c[1]; y < c[1] + 6; y++) for (let x = c[0]; x < c[0] + 6; x++) { a += d[at(x, y) + 3]; n++; }
      if (a / n >= 32) { preCut = false; break; }
    }
    const skipKey = preCut;
    // 全局键控仅对「极端幕布」启用（品红/绿幕 sat>150，或亮底棋盘格）：
    // 暗红这类低对比底若也全局键控，脸部暗调、深色矛杆等封闭/贴边区域会被连带吃掉
    const chromaBg = !skipKey && bgSat > 60 && (lum(bgs[0]) > 200 || bgSat > 150);
    const isBg = (i: number): boolean => {
      if (skipKey) return false; // 预抠图：不做键控
      const r = d[i], g = d[i + 1], b = d[i + 2];
      for (const c of bgs) {
        if (Math.abs(r - c[0]) + Math.abs(g - c[1]) + Math.abs(b - c[2]) < T) return true;
      }
      if (chromaBg) return false;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      return (mx - mn) < 20 && mn > 195; // 兜底：高亮低饱和（纯白/浅灰格）
    };
    const seen = new Uint8Array(W * H);
    const stack: number[] = [];
    const push = (x: number, y: number): void => {
      const k = y * W + x;
      if (!seen[k] && isBg(k * 4)) { seen[k] = 1; stack.push(x, y); }
    };
    for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
    for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
    while (stack.length) {
      const y = stack.pop() as number, x = stack.pop() as number;
      if (x > 0) push(x - 1, y);
      if (x < W - 1) push(x + 1, y);
      if (y > 0) push(x, y - 1);
      if (y < H - 1) push(x, y + 1);
    }
    // 色幕全局键控：封闭区域（手臂与躯干间围出的洞）边界洪水够不到，
    // 高饱和幕布色与主体不会撞色，可安全地对整图所有幕布色像素直接抠除
    if (chromaBg) {
      for (let k = 0; k < W * H; k++) if (!seen[k] && isBg(k * 4)) seen[k] = 1;
    }
    // 抠除 + 两级边缘处理：ring1（紧邻背景）直接透明——去掉被幕布/棋盘格污染的镶边；
    // ring2 再半透明羽化软化锯齿
    const ring1 = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = y * W + x;
      if (seen[k]) continue;
      if ((x > 0 && seen[k - 1]) || (x < W - 1 && seen[k + 1]) || (y > 0 && seen[k - W]) || (y < H - 1 && seen[k + W])) ring1[k] = 1;
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = y * W + x;
      if (seen[k] || ring1[k]) { d[k * 4 + 3] = 0; continue; }
      const adj1 = (x > 0 && ring1[k - 1]) || (x < W - 1 && ring1[k + 1]) || (y > 0 && ring1[k - W]) || (y < H - 1 && ring1[k + W]);
      if (adj1) d[k * 4 + 3] = 255; // 去羽化：硬边（消除放大后的软光晕）；preCut 部件不进此分支
    }
    ctx.putImageData(img, 0, 0);
    return { cvs, img, W, H };
  } catch {
    return null;
  }
}

/** 精灵抠底：返回抠底后 dataURL，失败返回 null。 */
function cutoutBackground(src: any): string | null {
  const r = cutoutImageData(src);
  if (!r) return null;
  try { return r.cvs.toDataURL("image/png"); } catch { return null; }
}

/** 部件位图：抠底 dataURL + 不透明内容包围盒（骨骼 pivot/比例自标定用） */
export interface PartBitmap {
  url: string;
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** 抠底并测量内容包围盒（alpha>32 视为内容，含羽化边）；连通域去碎屑清除水印残字/噪点 */
export function cutoutToBitmap(src: any): PartBitmap | null {
  const r = cutoutImageData(src);
  if (!r) return null;
  const d: Uint8ClampedArray = r.img.data;
  const W = r.W, H = r.H;
  // —— 连通域去碎屑：与主体不相连的小块（AI 水印残字、飘散噪点）直接清除 ——
  const comp = new Int32Array(W * H).fill(-1);
  const areas: number[] = [];
  const stack: number[] = [];
  for (let y0 = 0; y0 < H; y0++) for (let x0 = 0; x0 < W; x0++) {
    const s = y0 * W + x0;
    if (d[s * 4 + 3] <= 32 || comp[s] >= 0) continue;
    const cid = areas.length;
    let a = 0;
    comp[s] = cid;
    stack.push(s);
    while (stack.length) {
      const k = stack.pop() as number;
      a++;
      const kx = k % W;
      if (kx > 0 && d[(k - 1) * 4 + 3] > 32 && comp[k - 1] < 0) { comp[k - 1] = cid; stack.push(k - 1); }
      if (kx < W - 1 && d[(k + 1) * 4 + 3] > 32 && comp[k + 1] < 0) { comp[k + 1] = cid; stack.push(k + 1); }
      if (k >= W && d[(k - W) * 4 + 3] > 32 && comp[k - W] < 0) { comp[k - W] = cid; stack.push(k - W); }
      if (k < W * (H - 1) && d[(k + W) * 4 + 3] > 32 && comp[k + W] < 0) { comp[k + W] = cid; stack.push(k + W); }
    }
    areas.push(a);
  }
  if (areas.length > 0) {
    const maxA = Math.max(...areas);
    const minA = Math.max(0.02 * maxA, 400);
    let dirty = false;
    for (let k = 0; k < W * H; k++) {
      if (comp[k] >= 0 && areas[comp[k]] < minA) { d[k * 4 + 3] = 0; dirty = true; }
    }
    if (dirty) r.cvs.getContext("2d").putImageData(r.img, 0, 0);
  }
  // —— 包围盒（基于去碎屑后的不透明像素）——
  let left = W, right = -1, top = H, bottom = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (d[(y * W + x) * 4 + 3] > 32) {
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < 0) return null;
  try { return { url: r.cvs.toDataURL("image/png"), width: W, height: H, left, right, top, bottom }; }
  catch { return null; }
}

/** 原生 Image 加载（Promise 化，失败 resolve null）。Laya 的 Texture2D 不可 drawImage/getImageData，像素处理必须用原生图。 */
function loadImg(url: string): Promise<any> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = url;
  });
}

/**
 * 预加载全部 AI 贴图；完成后回调 onReady（用于触发地图重绘）。
 * 第一阶段：原生 Image 加载原图拿像素（Laya Texture2D 的 source 不可绘制）。
 * 第二阶段：地面 bakeDiamond 烘焙 64×32 菱形、精灵 cutoutBackground 抠底，产出的 dataURL
 *           交 Laya.loader.load 生成纹理存入 tileTex/spriteTex（dataURL 加载已验证可用）。
 * 任一环节失败该 kind 缺失 → IsoMap 自动回退程序化；整体不抛错。
 */
export function loadMapAssets(onReady?: () => void): void {
  if (!MAP_ASSETS_ENABLED) { onReady?.(); return; }
  const L: any = (globalThis as any).Laya;
  const loader: any = L?.loader;
  if (!loader || typeof loader.load !== "function") { onReady?.(); return; }

  const run = async (): Promise<void> => {
    const tileImgs: Record<string, any> = {};
    const spriteImgs: Record<string, any> = {};
    await Promise.all([
      ...(TILE_KINDS as readonly string[]).map(async (k) => { const im = await loadImg(tileURL(k)); if (im) tileImgs[k] = im; }),
      ...(SPRITE_KINDS as readonly string[]).map(async (k) => { const im = await loadImg(spriteURL(k)); if (im) spriteImgs[k] = im; }),
    ]);
    const bakedFor: Record<string, string> = {};
    const cutFor: Record<string, string> = {};
    const nextUrls: string[] = [];
    for (const k of (TILE_KINDS as readonly string[])) {
      if (tileImgs[k]) { const d = bakeDiamond(tileImgs[k]); if (d) { bakedFor[k] = d; nextUrls.push(d); } }
    }
    for (const k of (SPRITE_KINDS as readonly string[])) {
      if (spriteImgs[k]) { const d = cutoutBackground(spriteImgs[k]); if (d) { cutFor[k] = d; nextUrls.push(d); } }
    }
    if (nextUrls.length > 0) {
      try { await loader.load(nextUrls); } catch { /* dataURL 加载失败则保持缺失回退 */ }
    }
    for (const k of (SPRITE_KINDS as readonly string[])) {
      const t = cutFor[k] ? loader.getRes?.(cutFor[k]) : null;
      if (t) spriteTex[k] = t;
    }
    for (const k of (TILE_KINDS as readonly string[])) {
      const bt = bakedFor[k] ? loader.getRes?.(bakedFor[k]) : null;
      if (bt) tileTex[k] = bt;
    }
    onReady?.();
  };
  run().catch(() => onReady?.());
}
