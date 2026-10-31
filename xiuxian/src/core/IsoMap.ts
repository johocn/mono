/**
 * 2.5D 斜视角地图：菱形等距瓦片 + Y-sort 遮挡 + A* 寻路 + 跟随相机。
 * 美术全部程序化绘制（占位），后续可替换为图集/Spine，接口不变。
 */
import { CURRENT_MAP, isWalkable, inBounds, worldW, worldH, type MapDef, type TileKind } from "../data/map";
import { getTileTex, getSpriteTex, loadMapAssets } from "../data/mapAssets";

export const TILE_W = 64; // 等距菱形瓦片宽（2:1）
export const TILE_H = 32; // 等距菱形瓦片高（宽的一半）
/** 单一瓦片尺寸（等距：菱形，宽:高 = 2:1） */
export const TILE = TILE_W;

/** AI 精灵目标显示高度（世界像素，按 TILE_H=32 折算格数）；未列出的按原图尺寸 */
const SPRITE_TARGET_H: Record<string, number> = {
  house: 118, residence: 138, smith: 106, shop: 128,
  tree: 172, wall: 50,
};

/**
 * 网格坐标 → 世界像素（瓦片菱形中心）。
 * 经典 2:1 等距投影：x 随 (gx-gy) 左右展开，y 随 (gx+gy) 前后展开。
 * 角色/建筑/地面/道具均以该中心为脚底/格心锚点，Y-sort 按 (gx+gy) 决定前后遮挡。
 */
export function gridToScreen(gx: number, gy: number): { x: number; y: number } {
  return { x: (gx - gy) * (TILE_W / 2), y: (gx + gy) * (TILE_H / 2) };
}

/** 世界像素 → 网格坐标（就近取整到最近菱形瓦片中心） */
export function screenToGrid(x: number, y: number): { gx: number; gy: number } {
  const a = x / (TILE_W / 2);
  const b = y / (TILE_H / 2);
  return { gx: Math.round((a + b) / 2), gy: Math.round((b - a) / 2) };
}

/**
 * 从 (gx,gy) 向外螺旋搜索最近可走格（半径 maxR 内）。
 * 点击越界（落在地图外黑色虚空）时先钳制回边界再螺旋外扩，
 * 保证点击任何可见地块角色必有响应，消除「点哪都不动」的结界感。
 */
export function nearestWalkable(map: MapDef, gx: number, gy: number, maxR = 10): { gx: number; gy: number } | null {
  gx = Math.floor(gx); gy = Math.floor(gy);
  const cgx = Math.max(0, Math.min(map.w - 1, gx));
  const cgy = Math.max(0, Math.min(map.h - 1, gy));
  if (isWalkable(cgx, cgy, map)) return { gx: cgx, gy: cgy };
  for (let r = 1; r <= maxR; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = cgx + dx, ny = cgy + dy;
        if (isWalkable(nx, ny, map)) return { gx: nx, gy: ny };
      }
    }
  }
  return null;
}

/** 屋顶出檐倍率（相对瓦片半宽/半高）：越大飞檐越夸张；密集村落过大会显得拥挤，调小即可 */
const EAVE_SPREAD = 1.26;

// —— 仙剑风建筑构件配色（青瓦 / 朱柱 / 白墙 / 青石台基）——
const ARCH = {
  baseTop: "#8b9099",    // 台基顶面（青石）
  baseL: "#6d727a",      // 台基左侧
  baseR: "#585d64",      // 台基右侧
  pillarL: "#a34a48",    // 朱红立柱（受光）
  pillar: "#8b3a3a",
  pillarR: "#6d2c2c",
  door: "#402c1f",       // 门
  knob: "#c9a227",       // 门环 / 金属件
  winPaper: "#f2e4c4",   // 窗纸
  winFrame: "#6b4f36",   // 窗棂
  plaque: "#33261b",     // 匾额底
  plaqueTxt: "#d9b45a",  // 匾额字（金）
  lantern: "#b8322a",    // 灯笼
  lanternGlow: "#ffd166",
  ridge: "#2a333e",      // 正脊
  beast: "#c9a227",      // 吻兽
  eave: "#22282f",       // 檐口 / 瓦当
};

/** 颜色明度调整：k>0 混白提亮，k<0 混黑压暗（k 取 -1..1），用于同一色系的受光/背光面 */
function shade(hex: string, k: number): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return hex || "#888888";
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const t = Math.abs(k);
  const tg = k > 0 ? 255 : 0;
  let out = "#";
  for (let i = 0; i < 3; i++) {
    const v = parseInt(h.slice(i * 2, i * 2 + 2), 16);
    const n = Math.round(v + (tg - v) * t);
    out += Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  }
  return out;
}

/** 两色按 t∈[0,1] 线性混合（用于远景雾化褪色） */
function mix(a: string, b: string, t: number): string {
  const pa = parseHex(a), pb = parseHex(b);
  if (!pa || !pb) return a;
  const k = Math.max(0, Math.min(1, t));
  const to = (x: number, y: number) => Math.round(x + (y - x) * k).toString(16).padStart(2, "0");
  return "#" + to(pa[0], pb[0]) + to(pa[1], pb[1]) + to(pa[2], pb[2]);
}
function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** 确定性 2D 哈希 → [0,1)，用于同类瓦片/杂物散布的随机变体（不依赖 Math.random，切图稳定） */
function hash2(gx: number, gy: number): number {
  let h = (gx * 374761393 + gy * 668265263) >>> 0;
  h = (h ^ (h >> 13)) >>> 0;
  h = (h * 1274126177) >>> 0;
  h = (h ^ (h >> 16)) >>> 0;
  return (h % 100000) / 100000;
}

/** 线段描边（用细长四边形实现，不依赖引擎是否提供 drawLine） */
function seg(g: any, x0: number, y0: number, x1: number, y1: number, w: number, color: string): void {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (w / 2);
  const ny = (dx / len) * (w / 2);
  g.drawPoly(0, 0, [x0 + nx, y0 + ny, x1 + nx, y1 + ny, x1 - nx, y1 - ny, x0 - nx, y0 - ny], color, null, 0);
}

/** 地图美术主题（对应「五种风格」）。切换时重绘地面/装饰并改背景与萤火色。 */
export type ThemeName = "yunhai" | "taohua" | "moyuan" | "shuimo" | "xingkong" | "qingyu" | "yunhuang";
export const THEME_ORDER: ThemeName[] = ["yunhai", "taohua", "moyuan", "shuimo", "xingkong", "qingyu", "yunhuang"];
export const THEME_LABELS: Record<ThemeName, string> = {
  yunhai: "御剑仙山·云海宗门",
  taohua: "桃花秘境·灵溪洞天",
  moyuan: "幽冥魔渊·血炼渊谷",
  shuimo: "水墨丹青·写意山河",
  xingkong: "星空上古·浮空遗迹",
  qingyu: "青玉仙镇·烟火古镇",
  yunhuang: "云荒原野·苍茫古镇",
};
interface Theme { tiles: Record<string, string>; mote: string; bg: string; }
const THEMES: Record<ThemeName, Theme> = {
  // 默认=原落霞镇配色，保证未切换时观感不变
  yunhai: { tiles: { grass: "#46603f", path: "#6f6a58", water: "#2e4a5e", arena: "#6e5a3a", sand: "#b9a06a", reef: "#566b6e", portal: "#26415e" }, mote: "#fff0b0", bg: "#0e1622" },
  taohua: { tiles: { grass: "#5d7d5a", path: "#b08f86", water: "#5f9fb0", arena: "#7a5a55", sand: "#cdb38a", reef: "#6a7d80", portal: "#7a4f6e" }, mote: "#ffd0e6", bg: "#1a1622" },
  moyuan: { tiles: { grass: "#3a2e34", path: "#4a3538", water: "#5a2230", arena: "#52323a", sand: "#6a4a3a", reef: "#46343f", portal: "#3a1f3a" }, mote: "#c77dff", bg: "#140a14" },
  shuimo: { tiles: { grass: "#b9b3a3", path: "#8f8775", water: "#7e9098", arena: "#9a8e72", sand: "#b3a98f", reef: "#6f7479", portal: "#5a6470" }, mote: "#9a948a", bg: "#1c1a16" },
  xingkong: { tiles: { grass: "#28454f", path: "#34505c", water: "#1f3a64", arena: "#3a4a55", sand: "#3a5060", reef: "#2a4452", portal: "#2a4a8a" }, mote: "#7fb8ff", bg: "#070b18" },
  // 青玉仙镇：青玉地表 + 鎏金路 + 朱栏描边 + 青蓝符文传送阵
  qingyu: { tiles: { grass: "#2f5d54", path: "#a89256", water: "#234a60", arena: "#6b5430", sand: "#b9a06a", reef: "#33514c", portal: "#1f4a5e" }, mote: "#9be7c4", bg: "#0c1714" },
  // 云荒原野：暖陶土地表 + 苔绿 + 暮色天幕，与青玉仙镇的冷青玉明显区分；开放世界无围墙
  yunhuang: { tiles: { grass: "#5a6b3a", path: "#b5894e", water: "#3a5a6e", arena: "#7a5a30", sand: "#c9a86a", reef: "#5a5240", portal: "#5a3a6e" }, mote: "#ffd9a0", bg: "#1a1410" },
};
/** 当前调色板（setTheme 时整体替换；drawGround/drawDecor 运行时读取） */
let TILE_COLORS: Record<string, string> = { ...THEMES.yunhai.tiles };

interface ANode {
  gx: number;
  gy: number;
  g: number;
  h: number;
  f: number;
  parent: ANode | null;
}

const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/** A* 寻路（8 向，禁止贴角穿越）。找不到返回 null。 */
export function findPath(
  map: MapDef,
  sx: number, sy: number,
  tx: number, ty: number,
): { gx: number; gy: number }[] | null {
  sx = Math.floor(sx); sy = Math.floor(sy);
  tx = Math.floor(tx); ty = Math.floor(ty);
  if (!isWalkable(tx, ty, map)) {
  // 目标不可走时，退化到最近的可走邻点
  let best: { gx: number; gy: number } | null = null;
  let bd = Infinity;
  for (let gy = ty - 1; gy <= ty + 1; gy++) {
  for (let gx = tx - 1; gx <= tx + 1; gx++) {
    if (!isWalkable(gx, gy, map)) continue;
        const d = Math.abs(gx - tx) + Math.abs(gy - ty);
        if (d < bd) { bd = d; best = { gx, gy }; }
      }
    }
    if (!best) return null;
    tx = best.gx; ty = best.gy;
  }
  const key = (x: number, y: number) => y * map.w + x;
  const start: ANode = { gx: sx, gy: sy, g: 0, h: 0, f: 0, parent: null };
  const open: ANode[] = [start];
  const closed = new Set<number>();
  const seen = new Map<number, ANode>();
  seen.set(key(sx, sy), start);
  let guard = 0;
  while (open.length > 0 && guard++ < 4000) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur.gx === tx && cur.gy === ty) {
      const path: { gx: number; gy: number }[] = [];
      let n: ANode | null = cur;
      while (n && n.parent) {
        path.unshift({ gx: n.gx, gy: n.gy });
        n = n.parent;
      }
      return path;
    }
    closed.add(key(cur.gx, cur.gy));
    for (const [dx, dy, cost] of DIRS) {
      const nx = cur.gx + dx;
      const ny = cur.gy + dy;
      if (!isWalkable(nx, ny, map)) continue;
      const k = key(nx, ny);
      if (closed.has(k)) continue;
      // 禁止贴角穿越（斜走时两个正交邻点至少一个可走）
      if (dx !== 0 && dy !== 0) {
        if (!isWalkable(cur.gx + dx, cur.gy, map) || !isWalkable(cur.gx, cur.gy + dy, map)) continue;
      }
      const g = cur.g + cost;
      const existed = seen.get(k);
      if (existed && existed.g <= g) continue;
      const h = Math.abs(nx - tx) + Math.abs(ny - ty);
      const node: ANode = { gx: nx, gy: ny, g, h, f: g + h, parent: cur };
      seen.set(k, node);
      open.push(node);
    }
  }
  return null;
}

/** 跟随相机：把目标点尽量置于视口中心，边界钳制（世界单位）；命中时叠加震屏 */
export interface WorldBounds { minX: number; maxX: number; minY: number; maxY: number; }
export class Camera {
  x = 0;
  y = 0;
  /** 震屏强度 0~1，命中累积，随时间衰减（纯表现，不依赖确定性） */
  trauma = 0;
  shakeX = 0;
  shakeY = 0;
  readonly maxShake = 20;
  /**
   * @param bounds 等距投影下的真实世界包围盒（含负值 x，见 IsoMap.worldBounds）。
   *               钳制时把可见区域 [cam.x, cam.x+viewW] 限制在世界范围内并留 pad 余量，
   *               世界小于视口时居中，避免角落出屏 / 地图走不全。
   */
  follow(tx: number, ty: number, viewW: number, viewH: number, dt = 0.016, bounds?: WorldBounds): void {
    const b: WorldBounds = bounds || { minX: 0, maxX: worldW(), minY: 0, maxY: worldH() };
    const pad = 60;
    let minX = b.minX - pad;
    let maxX = b.maxX + pad - viewW;
    if (minX > maxX) { const c = (b.minX + b.maxX) / 2 - viewW / 2; minX = maxX = c; }
    let minY = b.minY - pad;
    let maxY = b.maxY + pad - viewH;
    if (minY > maxY) { const c = (b.minY + b.maxY) / 2 - viewH / 2; minY = maxY = c; }
    const cx = tx - viewW / 2;
    const cy = ty - viewH / 2;
    const tX = Math.max(minX, Math.min(maxX, cx));
    const tY = Math.max(minY, Math.min(maxY, cy));
    // 平滑跟随：指数缓动（帧率无关），消除硬跟随的僵硬感
    const k = 1 - Math.exp(-dt * 9);
    const baseX = this.x - this.shakeX; // 去掉上一帧震屏偏移，得到平滑基位
    const baseY = this.y - this.shakeY;
    const bx = baseX + (tX - baseX) * k;
    const by = baseY + (tY - baseY) * k;
    // 震屏：trauma² 决定抖动幅度，随 dt 衰减
    if (this.trauma > 0) {
      const off = this.trauma * this.trauma * this.maxShake;
      this.shakeX = (Math.random() * 2 - 1) * off;
      this.shakeY = (Math.random() * 2 - 1) * off;
      this.trauma = Math.max(0, this.trauma - dt * 1.8);
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }
    this.x = bx + this.shakeX;
    this.y = by + this.shakeY;
    // 镜头缩放冲击：punchZoom 触发后从峰值缓回 1
    if (this.zT > 0) {
      this.zT = Math.max(0, this.zT - dt);
      const k = this.zT / this.zDur;
      this.zoomMul = 1 + (this.zPeak - 1) * k;
    } else {
      this.zoomMul = 1;
    }
  }
  /** 累积震屏强度（暴击传更大值） */
  addTrauma(v: number): void {
    this.trauma = Math.min(1, this.trauma + v);
  }
  /** 镜头缩放冲击倍率（1=正常），punchZoom 后从峰值缓回 1 */
  zoomMul = 1;
  private zPeak = 1;
  private zT = 0;
  private zDur = 1;
  /** 触发一次镜头推拉：peak>1 推近后回弹（Boss 登场/击杀演出） */
  punchZoom(peak: number, dur = 0.45): void {
    this.zPeak = peak;
    this.zT = dur;
    this.zDur = dur;
  }
}

export interface StructureRec {
  id: string;
  gx: number;
  gy: number;
  /** 放置前的原始地表（拆除时还原） */
  orig: TileKind;
}

export class IsoMap {
  /** 当前地图（可由 rebuild 替换，实现多区域切图） */
  map: MapDef = CURRENT_MAP;
  /** 世界根容器（相机通过它的 x/y 偏移实现跟随） */
  readonly root: any;
  /** 缩放倍率（地图放大；滚轮缩放时由 Game 平滑调整） */
  zoom: number;
  private ground: any;
  private decor: any;
  /** 建筑层：玩家建造物（在装饰之上、角色之下） */
  readonly structureLayer: any;
  /** 玩家建筑占用的格子（"gx,gy"）：装饰层跳过，避免与建造层画出两个建筑叠加 */
  private structCells = new Set<string>();
  /** 高物件（房屋/树）：独立 Sprite 进角色层参与 Y-sort，人在其身后时被正确遮挡 */
  private props: { sprite: any; gx: number; gy: number }[] = [];
  /** 水面动态高光层（地面之上、装饰之下），每帧重绘产生水波 */
  private waterLayer: any;
  private waterTiles: { cx: number; cy: number; phase: number }[] = [];
  /** 氛围层：星点/萤火等环境粒子（装饰之上、角色之下） */
  private ambientLayer: any;
  /** 远景层：山峦剪影 + 雾气（在所有地块之下，制造纵深；随相机轻微视差） */
  private farLayer: any;
  private mistLayer: any;
  private farParallax = { x: 0, y: 0 };
  private elapsed = 0;
  /** 萤火颜色（随主题变化） */
  private moteColor = "#fff0b0";
  /** 环境粒子：star=静态呼吸星点；mote=飘动萤火；petal=飘落花瓣（制造世界「活气」与仙气） */
  private ambient: {
    sprite: any; kind: "star" | "mote" | "petal";
    bx: number; by: number; phase: number; spd: number;
    ax: number; ay: number;
  }[] = [];
  /** 雾气带（缓慢横向漂移，制造纵深仙气） */
  private mist: { sprite: any; bx: number; by: number; spd: number; w: number }[] = [];
  /** 角色层：每帧按 (gx+gy) 排序，实现前后遮挡 */
  readonly actorLayer: any;
  /** 地面预警层：敌人/Boss 攻击 telegraph、玩家技能落点预览（在角色之下、建筑之上） */
  readonly telegraphLayer: any;

  constructor(parent: any, zoom = 3) {
    this.zoom = zoom;
    this.root = new Laya.Sprite();
    this.root.scale(zoom, zoom);
    parent.addChild(this.root);
    this.ground = new Laya.Sprite();
    this.decor = new Laya.Sprite();
    this.ambientLayer = new Laya.Sprite();
    this.waterLayer = new Laya.Sprite();
    this.structureLayer = new Laya.Sprite();
    this.telegraphLayer = new Laya.Sprite();
    this.actorLayer = new Laya.Sprite();
    this.farLayer = new Laya.Sprite();
    this.mistLayer = new Laya.Sprite();
    this.root.addChild(this.farLayer);
    this.root.addChild(this.ground);
    this.root.addChild(this.decor);
    this.root.addChild(this.ambientLayer);
    this.root.addChild(this.waterLayer);
    this.root.addChild(this.structureLayer);
    this.root.addChild(this.telegraphLayer);
    this.root.addChild(this.mistLayer);
    this.root.addChild(this.actorLayer);
    this.drawFar();
    this.drawGround();
    this.drawDecor();
    this.initAmbient();
  }

  /** 素材加载完成后调用，重绘受贴图影响的图层（地面/装饰/远景/氛围） */
  refresh(): void {
    this.drawFar();
    this.drawGround();
    this.drawDecor();
    this.initAmbient();
  }

  /** 启动 AI 素材预加载（未启用时直接回调，等同无操作） */
  preloadAssets(onReady?: () => void): void {
    loadMapAssets(() => { this.refresh(); onReady?.(); });
  }

  /** 切图重建：替换地图并重绘地面/装饰，清空结构与角色层（角色由 Game 重新添加） */
  rebuild(map: MapDef): void {
    this.map = map;
    this.structCells.clear();
    this.ground.graphics.clear();
    this.decor.graphics.clear();
    this.waterLayer.graphics.clear();
    this.waterTiles = [];
    this.elapsed = 0;
    this.structureLayer.removeChildren();
    this.telegraphLayer.graphics.clear();
    this.actorLayer.removeChildren();
    this.drawGround();
    this.drawDecor();
    this.initAmbient();
  }

  /** 生成氛围粒子：静态呼吸星点 + 飘动萤火 + 飘落花瓣 + 雾气带；随地图随机散布；切图时重建 */
  private initAmbient(): void {
    this.ambientLayer.removeChildren();
    this.ambient = [];
    this.mist = [];
    // 静态星点（保留原呼吸星点观感）
    for (let i = 0; i < 14; i++) {
      const gx = Math.random() * this.map.w;
      const gy = Math.random() * this.map.h;
      const { x, y } = gridToScreen(gx, gy);
      const s = new Laya.Sprite();
      s.graphics.drawCircle(0, 0, 1.6, "#fff4c2", null, 0);
      s.pos(x, y);
      s.alpha = 0.5;
      this.ambientLayer.addChild(s);
      this.ambient.push({ sprite: s, kind: "star", bx: s.x, by: s.y, phase: Math.random() * 6.28, spd: 0.4 + Math.random() * 0.7, ax: 0, ay: 4 });
    }
    // 飘动萤火（缓慢游移 + 呼吸明灭，制造世界「活气」）
    for (let i = 0; i < 34; i++) {
      const gx = Math.random() * this.map.w;
      const gy = Math.random() * this.map.h;
      const { x, y } = gridToScreen(gx, gy);
      const s = new Laya.Sprite();
      s.graphics.drawCircle(0, 0, 1.4, this.moteColor, null, 0);
      s.blendMode = "add";
      s.pos(x, y);
      s.alpha = 0.5;
      this.ambientLayer.addChild(s);
      const px = x, py = y;
      this.ambient.push({
        sprite: s, kind: "mote", bx: px, by: py,
        phase: Math.random() * 6.28, spd: 0.25 + Math.random() * 0.5,
        ax: 10 + Math.random() * 22, ay: 8 + Math.random() * 16,
      });
    }
    // 飘落花瓣（桃/梅粉色，缓慢下落 + 横向摇曳，增添仙气与季节感）
    for (let i = 0; i < 22; i++) {
      const gx = Math.random() * this.map.w * 1.4 - this.map.w * 0.2;
      const gy = Math.random() * this.map.h;
      const { x, y } = gridToScreen(gx, gy);
      const s = new Laya.Sprite();
      const col = Math.random() > 0.5 ? "#f7c6d9" : "#ffd9e6";
      s.graphics.drawEllipse(0, 0, 3, 1.6, col, shade(col, -0.2), 1);
      s.pos(x, y);
      s.rotation = Math.random() * 60;
      s.alpha = 0.85;
      this.ambientLayer.addChild(s);
      this.ambient.push({
        sprite: s, kind: "petal", bx: x, by: y,
        phase: Math.random() * 6.28, spd: 0.5 + Math.random() * 0.6,
        ax: 6 + Math.random() * 10, ay: 10 + Math.random() * 14,
      });
    }
    // 雾气带：覆盖地图中段的半透明云带，缓慢横向漂移
    const top = gridToScreen(0, 0);
    const midY = top.y + (this.map.w + this.map.h) * (TILE_H / 2) * 0.4;
    for (let i = 0; i < 3; i++) {
      const s = new Laya.Sprite();
      const w = 520;
      s.graphics.drawEllipse(0, 0, w / 2, 36, "rgba(220,230,235,0.10)", null, 0);
      s.blendMode = "add";
      const bx = Math.random() * 900 - 200;
      s.pos(bx, midY + (i - 1) * 46);
      s.alpha = 0.7;
      this.mistLayer.addChild(s);
      this.mist.push({ sprite: s, bx, by: s.y, spd: 6 + i * 3 + Math.random() * 4, w });
    }
  }

  /** 氛围粒子 + 雾气 + 水面波纹：每帧调用（纯表现） */
  updateAmbient(dt: number): void {
    this.elapsed += dt;
    for (const p of this.ambient) {
      p.phase += dt * p.spd;
      if (p.kind === "star") {
        p.sprite.y = p.by + Math.sin(p.phase) * 4;
        p.sprite.alpha = 0.25 + 0.4 * (0.5 + 0.5 * Math.sin(p.phase * 1.3));
      } else if (p.kind === "petal") {
        // 花瓣：缓慢下落 + 横向摇曳 + 自转
        p.sprite.y = (p.by + ((this.elapsed * p.ay) % 600)) % 600 - 120;
        p.sprite.x = p.bx + Math.sin(p.phase) * p.ax;
        p.sprite.rotation = (p.phase * 30) % 360;
        p.sprite.alpha = 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(p.phase * 1.1));
      } else {
        // 萤火：在基准点附近椭圆游移 + 呼吸明灭
        p.sprite.x = p.bx + Math.sin(p.phase) * p.ax;
        p.sprite.y = p.by + Math.cos(p.phase * 0.8) * p.ay;
        p.sprite.alpha = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(p.phase * 1.7));
      }
    }
    // 雾气带横向漂移（循环回绕）
    for (const m of this.mist) {
      m.bx += m.spd * dt;
      if (m.bx > 1000) m.bx = -300;
      m.sprite.x = m.bx;
    }
    // 远景山峦轻微视差：远层随相机位移更慢，制造纵深
    const Z = this.zoom || 1;
    const PAR = 0.35;
    if (this.farLayer) {
      this.farLayer.x = (-(1 - PAR) * this.root.x) / Z;
      this.farLayer.y = (-(1 - PAR) * this.root.y) / Z;
    }
    // 水面波纹：每帧重绘高光带（缓慢流动，菱形水面）
    const wg = this.waterLayer.graphics;
    wg.clear();
    for (const t of this.waterTiles) {
      const ph = this.elapsed * 1.4 + t.phase;
      const a = 0.10 + 0.07 * Math.sin(ph);
      wg.drawEllipse(t.cx, t.cy, TILE_W * 0.62, TILE_H * 0.62, `rgba(180,225,245,${a.toFixed(3)})`, null, 0);
      // 一道流动高光竖带
      const lx = Math.sin(ph * 0.7) * (TILE_W * 0.20);
      wg.drawEllipse(t.cx + lx, t.cy, 6, TILE_H * 0.5, `rgba(220,245,255,${(a * 0.5).toFixed(3)})`, null, 0);
    }
  }

  /** 把某格设为阻挡（并改地表类型），返回原始类型供还原 */
  occupy(gx: number, gy: number, kind: TileKind): TileKind | null {
    if (!inBounds(gx, gy)) return null;
    const orig = this.map.kinds[gy][gx];
    this.map.kinds[gy][gx] = kind;
    this.map.blocked[gy][gx] = true;
    return orig;
  }

  /** 还原某格地表 */
  restore(gx: number, gy: number, orig: TileKind): void {
    if (!inBounds(gx, gy)) return;
    this.map.kinds[gy][gx] = orig;
    this.map.blocked[gy][gx] = orig === "house" || orig === "tree" || orig === "water";
  }

  /** 重绘全部玩家建造（放置/拆除/读档后调用） */
  redrawStructures(
    list: { id: string; gx: number; gy: number }[],
    colors: Record<string, { body: string; roof: string; style?: string }>,
  ): void {
    // 重建「玩家建筑格」并重绘装饰层：这些格由 structureLayer 单独绘制，避免两层各画一个建筑造成叠加
    this.structCells = new Set(list.map((s) => s.gx + "," + s.gy));
    this.decor.graphics.clear();
    this.drawDecor();
    const g = this.structureLayer.graphics;
    g.clear();
    for (const s of list) {
      const c = colors[s.id];
      if (!c) continue;
      const { x, y } = gridToScreen(s.gx, s.gy);
      this.drawBuilding(g, x, y, c.body, c.roof, c.style);
    }
  }

  /** 等距立方体（建造/预览共用）：地基 + 顶面 + 两侧 */
  drawBox(g: any, cx: number, cy: number, body: string, roof: string, h = 26): void {
    const top = cy - h;
    g.drawPoly(0, 0, [cx, cy - TILE_H / 2, cx + TILE_W / 2, cy, cx, cy + TILE_H / 2, cx - TILE_W / 2, cy], body, null, 0);
    g.drawPoly(0, 0, [cx, top - TILE_H / 2, cx + TILE_W / 2, top, cx, top + TILE_H / 2, cx - TILE_W / 2, top], roof, null, 0);
    g.drawPoly(0, 0, [cx - TILE_W / 2, top, cx, top + TILE_H / 2, cx, cy + TILE_H / 2, cx - TILE_W / 2, cy], body, null, 0);
    g.drawPoly(0, 0, [cx + TILE_W / 2, top, cx, top + TILE_H / 2, cx, cy + TILE_H / 2, cx + TILE_W / 2, cy], body, null, 0);
  }

  /** 切换地图美术主题（对应「五种风格」）：换调色板 + 背景 + 萤火，并重绘地面/装饰 */
  setTheme(name: ThemeName): void {
    const t = THEMES[name];
    if (!t) return;
    TILE_COLORS = { ...t.tiles };
    this.moteColor = t.mote;
    try { (Laya as any).stage.bgColor = t.bg; } catch { /* 无舞台环境（如冒烟测试）忽略 */ }
    this.drawGround();
    this.drawDecor();
    this.initAmbient();
  }

  private drawGround(): void {
    const g = this.ground.graphics;
    const W = this.map.w, H = this.map.h;
    this.waterTiles = [];
    const hw = TILE_W / 2, hh = TILE_H / 2;
    const bgFog = (Laya as any).stage?.bgColor || "#0e1622";
    for (let gy = 0; gy < H; gy++) {
      for (let gx = 0; gx < W; gx++) {
        const kind = this.map.kinds[gy][gx];
        const { x, y } = gridToScreen(gx, gy); // 菱形中心
        const d = [x, y - hh, x + hw, y, x, y + hh, x - hw, y];
        // —— AI 贴图优先：已生成 64×32 等距菱形瓦片则直接贴图（无缝平铺）——
        const tex = getTileTex(kind);
        if (tex) {
          g.drawTexture(tex, x - hw, y - hh, TILE_W, TILE_H);
          if (kind === "water") this.waterTiles.push({ cx: x, cy: y, phase: hash2(gx + 7, gy + 13) * 6.28 });
          continue;
        }
        // —— 程序化回退：分层着色 + 纵深雾 + 中心受光，营造仙侠山水质感 ——
        const base = TILE_COLORS[kind] || TILE_COLORS.grass;
        const v = hash2(gx, gy);
        let color = shade(base, (v - 0.5) * 0.12);
        // 等距纵深：靠近观察者（gx+gy 大）略压暗；远端（小）向天幕雾化褪色，制造空气透视
        const depth = (gx + gy) / (W + H);
        color = mix(color, "#000000", Math.min(0.16, depth * 0.20));
        color = mix(color, bgFog, Math.max(0, 0.22 - depth * 0.34));
        g.drawPoly(0, 0, d, color, null, 0);
        // 中心受光：内圈略提亮，模拟柔和顶光
        const li = [x, y - hh * 0.42, x + hw * 0.42, y, x, y + hh * 0.42, x - hw * 0.42, y];
        g.drawPoly(0, 0, li, shade(color, 0.10), null, 0);
        // 瓦片接缝（南/东缘压暗，制造瓦片厚度与立体感）
        g.drawPoly(0, 0, d, null, shade(color, -0.5), 1);
        if (kind === "path") {
          const ip = [x, y - hh * 0.6, x + hw * 0.6, y, x, y + hh * 0.6, x - hw * 0.6, y];
          g.drawPoly(0, 0, ip, shade(base, -0.20), null, 0);
          // 路边石灯（AI 灯笼贴图），稀疏点缀，营造仙侠夜行氛围
          const lan = getSpriteTex("lantern");
          if (lan && hash2(gx + 3, gy + 9) > 0.93) this.drawSpriteDecal(g, lan, x, y - hh, TILE_W * 0.42);
        } else if (kind === "sand") {
          const ip = [x, y - hh * 0.7, x + hw * 0.7, y, x, y + hh * 0.7, x - hw * 0.7, y];
          g.drawPoly(0, 0, ip, shade(base, 0.10), null, 0);
        } else if (kind === "reef") {
          g.drawPoly(0, 0, [x, y - hh * 0.6, x + hw * 0.6, y, x, y + hh * 0.6, x - hw * 0.6, y], "#5a6b6e", "#33403f", 1);
        } else if (kind === "water") {
          g.drawPoly(0, 0, [x, y - hh + 2, x + hw - 2, y, x, y + hh - 2, x - hw + 2, y], "#2c4f66", null, 0);
          this.waterTiles.push({ cx: x, cy: y, phase: hash2(gx + 7, gy + 13) * 6.28 });
        }
      }
    }
  }

  /**
   * 远景层：青绿山峦剪影 + 流动雾气带（在所有地块之下）。
   * 山形沿世界 map 的「远方」（gx+gy 最小的上缘）铺开，配合 Game 的相机位移做轻微视差。
   */
  private drawFar(): void {
    const fl = this.farLayer.graphics;
    fl.clear();
    const W = this.map.w, H = this.map.h;
    const top = gridToScreen(0, 0);
    const left = gridToScreen(0, H - 1);
    const right = gridToScreen(W - 1, 0);
    const span = Math.max(right.x - left.x, 600);
    const baseY = Math.min(top.y, left.y, right.y) - 40;
    const haze = (Laya as any).stage?.bgColor || "#0e1622";
    // 远山三层（由远及近、由淡到浓），三角剪影
    const layers = [
      { dy: -150, h: 120, col: shade(haze, 0.16), a: 0.45 },
      { dy: -110, h: 150, col: shade(haze, 0.26), a: 0.55 },
      { dy: -70, h: 170, col: shade(haze, 0.36), a: 0.65 },
    ];
    for (const L of layers) {
      const y0 = baseY + L.dy;
      fl.drawPoly(0, 0, [
        left.x - 200, y0 + L.h * 0.6, left.x + span * 0.18, y0,
        left.x + span * 0.40, y0 + L.h * 0.5, left.x + span * 0.60, y0 - L.h * 0.1,
        left.x + span * 0.82, y0 + L.h * 0.55, left.x + span + 200, y0 + L.h * 0.6,
        left.x + span + 200, y0 + L.h * 3, left.x - 200, y0 + L.h * 3,
      ], `rgba(${parseHex(L.col)![0]},${parseHex(L.col)![1]},${parseHex(L.col)![2]},${L.a})`, null, 0);
    }
  }

  private drawDecor(): void {
    // 高物件（房屋/树）每轮重建：先移除旧 Sprite，避免 redrawStructures 重复叠加
    for (const p of this.props) {
      if (typeof p.sprite.removeSelf === "function") p.sprite.removeSelf();
      else if (p.sprite.parent && typeof p.sprite.parent.removeChild === "function") p.sprite.parent.removeChild(p.sprite);
    }
    this.props = [];
    const g = this.decor.graphics;
    for (let gy = 0; gy < this.map.h; gy++) {
      for (let gx = 0; gx < this.map.w; gx++) {
        const kind = this.map.kinds[gy][gx];
        const { x, y } = gridToScreen(gx, gy); // 菱形中心
        const cx = x, cy = y;
        if (this.structCells.has(gx + "," + gy)) continue; // 该格是玩家建筑，交给 structureLayer 单独绘制
        if (kind === "house" || kind === "tree" || kind === "smith" || kind === "shop" || kind === "residence" || kind === "wall") {
          // 高物件独立 Sprite 加入角色层，由 resort() 与角色一起按 (gx+gy) 排序：
          // 人物在房子/树后面（北侧，gx+gy 更小）时被屋顶/树冠遮挡，不再「站在屋顶上」。
          const s = new Laya.Sprite();
          s.pos(x, y);
          // AI 精灵优先：已生成等距 billboard（脚底在图像底部中心）则按目标高度缩放贴图
          const st = getSpriteTex(kind);
          if (st) {
            const tw = Number(st.width || (st as any).sourceWidth || 96);
            const th = Number(st.height || (st as any).sourceHeight || 128);
            const targetH = SPRITE_TARGET_H[kind] ?? th;
            const scale = Math.min(1, targetH / th);
            const w = tw * scale, h = th * scale;
            s.graphics.drawTexture(st, -w / 2, -h, w, h);
          } else if (kind === "house") this.drawHouse(s.graphics, 0, 0);
          else if (kind === "tree") this.drawTree(s.graphics, 0, 0);
          else if (kind === "smith") this.drawSmith(s.graphics, 0, 0);
          else if (kind === "shop") this.drawApothecary(s.graphics, 0, 0);
          else if (kind === "wall") this.drawWall(s.graphics, 0, 0);
          else this.drawResidence(s.graphics, 0, 0);
          this.actorLayer.addChild(s);
          this.props.push({ sprite: s, gx, gy });
          continue;
        }
        if (kind === "arena") this.drawArenaRing(g, cx, cy);
        else if (kind === "reef") this.drawReef(g, cx, cy);
        else if (kind === "portal") this.drawPortal(g, cx, cy);
        else if (kind === "grass") {
          const h = hash2(gx, gy);
          const tuftTex = getSpriteTex("tuft");
          const rockTex = getSpriteTex("rock");
          if (h > 0.88) {
            // AI 灵石贴图优先（脚底落在格心），缺失回退程序化石砾
            if (rockTex) this.drawSpriteDecal(g, rockTex, cx, cy, TILE_W * 0.5);
            else this.drawRockDecal(g, cx, cy);
          } else if (h > 0.76) {
            // AI 花簇贴图优先，缺失回退程序化草丛
            if (tuftTex) this.drawSpriteDecal(g, tuftTex, cx, cy, TILE_W * 0.6);
            else this.drawGrassTuft(g, cx, cy);
          }
        }
      }
    }
  }

  /** 贴地小石（自带淡影），用于草地填充 */
  private drawRockDecal(g: any, cx: number, cy: number): void {
    g.drawEllipse(cx, cy + 3, 9, 4, "rgba(0,0,0,0.20)", null, 0);
    g.drawPoly(0, 0, [cx - 5, cy + 2, cx - 2, cy - 4, cx + 4, cy - 3, cx + 6, cy + 2], "#8a8f96", "#5c6168", 1);
    g.drawPoly(0, 0, [cx - 2, cy - 4, cx + 4, cy - 3, cx + 1, cy - 1], "#a7adb4", null, 0);
  }

  /** 草丛点缀（三簇带自影），用于草地填充 */
  private drawGrassTuft(g: any, cx: number, cy: number): void {
    g.drawEllipse(cx, cy + 3, 10, 4, "rgba(0,0,0,0.16)", null, 0);
    for (const dx of [-5, 1, 6]) {
      g.drawPoly(0, 0, [cx + dx, cy + 2, cx + dx - 2, cy - 8, cx + dx + 1, cy - 11, cx + dx + 3, cy - 7, cx + dx + 4, cy + 2], "#3f6b3a", "#2c4d2a", 1);
    }
  }

  /** 把 AI 精灵贴图贴在贴地位（脚底位于给定世界点 fx,fy），用于替换程序化小装饰/道具 */
  private drawSpriteDecal(g: any, tex: any, fx: number, fy: number, w: number): void {
    const tw = Number(tex.width || (tex as any).sourceWidth || 256);
    const th = Number(tex.height || (tex as any).sourceHeight || 320);
    const h = w * (th / tw);
    g.drawTexture(tex, fx - w / 2, fy - h, w, h);
  }

  /** 高物件参与 Y-sort 的条目（Game 每帧与角色合并后调用 resort） */
  propEntries(): { sprite: any; gx: number; gy: number }[] {
    return this.props;
  }

  /** 礁石：俯视灰青圆石 + 淡影 */
  private drawReef(g: any, cx: number, cy: number): void {
    const r = TILE * 0.30;
    g.drawEllipse(cx, cy + r * 0.4, r * 1.1, r * 0.5, "rgba(0,0,0,0.20)", null, 0);
    g.drawRect(cx - r, cy - r, r * 2, r * 2, "#5a6b6e", "#33403f", 1.5);
    g.drawRect(cx - r * 0.5, cy - r * 0.6, r, r * 0.5, "#7e9094", null, 0);
  }

  /** 传送阵：青蓝符文环（俯视同心圆） */
  private drawPortal(g: any, cx: number, cy: number): void {
    g.drawCircle(cx, cy, 26, "rgba(46,107,138,0.30)", "#7fd0e0", 2);
    g.drawCircle(cx, cy, 16, "rgba(127,208,224,0.22)", null, 0);
    g.drawCircle(cx, cy, 7, "#dff6ff", "#7fd0e0", 1.5);
  }

  /** 青石台基（须弥座）：菱形顶面 + 两侧 */
  private drawBase(g: any, cx: number, cy: number, h = 5): void {
    const hw = TILE_W / 2, hh = TILE_H / 2;
    const top = cy - h;
    g.drawPoly(0, 0, [cx, top - hh, cx + hw, top, cx, top + hh, cx - hw, top], ARCH.baseTop, null, 0);
    g.drawPoly(0, 0, [cx - hw, top, cx, top + hh, cx, cy + hh, cx - hw, cy], ARCH.baseL, null, 0);
    g.drawPoly(0, 0, [cx, top + hh, cx + hw, top, cx + hw, cy, cx, cy + hh], ARCH.baseR, null, 0);
  }

  /** 墙体：两侧受光/背光 + 朱红立柱 + 门 + 匾额 + 窗棂（全部贴合等距斜面） */
  private drawWalls(g: any, cx: number, cy: number, body: string, botY: number, wallH: number): void {
    const hw = TILE_W / 2, hh = TILE_H / 2;
    const topY = botY - wallH;
    // 两侧墙体（左受光 / 右背光）+ 墙顶面
    g.drawPoly(0, 0, [cx - hw, topY, cx, topY + hh, cx, botY + hh, cx - hw, botY], shade(body, 0.10), null, 0);
    g.drawPoly(0, 0, [cx, topY + hh, cx + hw, topY, cx + hw, botY, cx, botY + hh], shade(body, -0.16), null, 0);
    g.drawPoly(0, 0, [cx, topY - hh, cx + hw, topY, cx, topY + hh, cx - hw, topY], shade(body, 0.22), null, 0);
    // 立柱：左(W) / 中(S) / 右(E)
    const pw = 5, ph = pw * (hh / hw);
    g.drawPoly(0, 0, [cx - hw, topY, cx - hw + pw, topY + ph, cx - hw + pw, botY + ph, cx - hw, botY], ARCH.pillarL, null, 0);
    g.drawPoly(0, 0, [cx + hw, topY, cx + hw - pw, topY + ph, cx + hw - pw, botY + ph, cx + hw, botY], ARCH.pillarR, null, 0);
    g.drawPoly(0, 0, [
      cx - pw / 2, topY + hh - ph / 2, cx + pw / 2, topY + hh + ph / 2,
      cx + pw / 2, botY + hh + ph / 2, cx - pw / 2, botY + hh - ph / 2,
    ], ARCH.pillar, null, 0);
    // 右面（朝观察者右下）：匾额 + 门
    const rPt = (u: number, v: number) => ({ x: cx + u * hw, y: topY + hh - u * hh + v * wallH });
    const q0 = rPt(0.44, 0.10), q1 = rPt(0.70, 0.10), q2 = rPt(0.70, 0.26), q3 = rPt(0.44, 0.26);
    g.drawPoly(0, 0, [q0.x, q0.y, q1.x, q1.y, q2.x, q2.y, q3.x, q3.y], ARCH.plaque, ARCH.plaqueTxt, 1);
    const dA = rPt(0.42, 0.32), dB = rPt(0.72, 0.32), dC = rPt(0.72, 1.0), dD = rPt(0.42, 1.0);
    g.drawPoly(0, 0, [dA.x, dA.y, dB.x, dB.y, dC.x, dC.y, dD.x, dD.y], ARCH.door, null, 0);
    seg(g, (dA.x + dB.x) / 2, (dA.y + dB.y) / 2, (dD.x + dC.x) / 2, (dD.y + dC.y) / 2, 1.2, ARCH.knob); // 门缝
    // 左面：纸窗 + 十字窗棂
    const lPt = (u: number, v: number) => ({ x: cx - hw + u * hw, y: topY + u * hh + v * wallH });
    const wA = lPt(0.30, 0.24), wB = lPt(0.66, 0.24), wC = lPt(0.66, 0.64), wD = lPt(0.30, 0.64);
    g.drawPoly(0, 0, [wA.x, wA.y, wB.x, wB.y, wC.x, wC.y, wD.x, wD.y], ARCH.winPaper, ARCH.winFrame, 1);
    seg(g, (wA.x + wD.x) / 2, (wA.y + wD.y) / 2, (wB.x + wC.x) / 2, (wB.y + wC.y) / 2, 1, ARCH.winFrame);
    seg(g, (wA.x + wB.x) / 2, (wA.y + wB.y) / 2, (wD.x + wC.x) / 2, (wD.y + wC.y) / 2, 1, ARCH.winFrame);
  }

  /** 飞檐屋顶：檐口四角上翘外伸 + 四坡 + 瓦楞 + 正脊吻兽 */
  private drawRoof(g: any, cx: number, baseY: number, roof: string, ridgeH = 20): void {
    const hw = (TILE_W / 2) * EAVE_SPREAD; // 檐口半宽（出檐）
    const hh = (TILE_H / 2) * EAVE_SPREAD;
    const tw = (TILE_W / 2) * 0.42; // 屋脊半宽
    const th = (TILE_H / 2) * 0.42;
    // 檐口剪影：四角上翘外伸、四边内凹（飞檐）；坡面覆盖后仅外缘露出，形成檐口厚度与翘角
    const tipN = { x: cx, y: baseY - hh - 6 };
    const tipE = { x: cx + hw + 5, y: baseY - 3 };
    const tipS = { x: cx, y: baseY + hh - 2 };
    const tipW = { x: cx - hw - 5, y: baseY - 3 };
    const cNE = { x: cx + hw * 0.44, y: baseY - hh * 0.44 };
    const cES = { x: cx + hw * 0.44, y: baseY + hh * 0.44 };
    const cSW = { x: cx - hw * 0.44, y: baseY + hh * 0.44 };
    const cWN = { x: cx - hw * 0.44, y: baseY - hh * 0.44 };
    g.drawPoly(0, 0, [
      tipN.x, tipN.y, cNE.x, cNE.y, tipE.x, tipE.y, cES.x, cES.y,
      tipS.x, tipS.y, cSW.x, cSW.y, tipW.x, tipW.y, cWN.x, cWN.y,
    ], ARCH.eave, null, 0);
    // 屋脊四点
    const ry = baseY - ridgeH;
    const rgN = { x: cx, y: ry - th };
    const rgE = { x: cx + tw, y: ry };
    const rgS = { x: cx, y: ry + th };
    const rgW = { x: cx - tw, y: ry };
    // 后坡（先画，压暗）
    g.drawPoly(0, 0, [tipN.x, tipN.y, tipE.x, tipE.y, rgE.x, rgE.y, rgN.x, rgN.y], shade(roof, -0.30), null, 0);
    g.drawPoly(0, 0, [tipW.x, tipW.y, tipN.x, tipN.y, rgN.x, rgN.y, rgW.x, rgW.y], shade(roof, -0.36), null, 0);
    // 前坡（左受光 / 右背光）
    g.drawPoly(0, 0, [tipS.x, tipS.y, tipW.x, tipW.y, rgW.x, rgW.y, rgS.x, rgS.y], shade(roof, 0.12), null, 0);
    g.drawPoly(0, 0, [tipE.x, tipE.y, tipS.x, tipS.y, rgS.x, rgS.y, rgE.x, rgE.y], shade(roof, -0.12), null, 0);
    // 瓦楞
    for (const t of [0.34, 0.67]) {
      seg(g,
        rgS.x + (rgW.x - rgS.x) * t, rgS.y + (rgW.y - rgS.y) * t,
        tipS.x + (tipW.x - tipS.x) * t, tipS.y + (tipW.y - tipS.y) * t, 1.2, shade(roof, -0.20));
      seg(g,
        rgS.x + (rgE.x - rgS.x) * t, rgS.y + (rgE.y - rgS.y) * t,
        tipS.x + (tipE.x - tipS.x) * t, tipS.y + (tipE.y - tipS.y) * t, 1.2, shade(roof, -0.28));
    }
    // 脊部平台 + 正脊 + 吻兽
    g.drawPoly(0, 0, [rgN.x, rgN.y, rgE.x, rgE.y, rgS.x, rgS.y, rgW.x, rgW.y], shade(roof, 0.26), null, 0);
    seg(g, rgW.x, rgW.y, rgE.x, rgE.y, 4, ARCH.ridge);
    g.drawPoly(0, 0, [rgW.x - 1, rgW.y, rgW.x - 3, rgW.y - 6, rgW.x + 3, rgW.y - 2], ARCH.beast, null, 0);
    g.drawPoly(0, 0, [rgE.x + 1, rgE.y, rgE.x + 3, rgE.y - 6, rgE.x - 3, rgE.y - 2], ARCH.beast, null, 0);
  }

  /**
   * 等距飞檐建筑：青石台基 + 白墙朱柱（drawWalls）+ 翘角飞檐屋顶（drawRoof）。
   * 以瓦片菱形中心 (cx,cy) 为基底，向斜上方堆叠出 2.5D 立体楼阁。
   */
  private drawHall(g: any, cx: number, cy: number, body: string, roof: string, door = "#402c1f"): void {
    const hw = TILE_W / 2, hh = TILE_H / 2;
    // 接地阴影（菱形）
    g.drawPoly(0, 0, [cx, cy - hh, cx + hw, cy, cx, cy + hh, cx - hw, cy], "rgba(0,0,0,0.22)", null, 0);
    const wallH = 22, ridgeH = 14;
    this.drawWalls(g, cx, cy, body, cy, wallH);
    this.drawRoof(g, cx, cy - wallH, roof, ridgeH);
  }

  /** 灵田：低矮菱形土台 + 田垄 + 灵苗（等距贴地） */
  private drawField(g: any, cx: number, cy: number, body: string, roof: string): void {
    const hw = TILE_W / 2, hh = TILE_H / 2;
    g.drawPoly(0, 0, [cx, cy - hh, cx + hw, cy, cx, cy + hh, cx - hw, cy], shade(body, -0.28), "#3a2e1e", 1);
    for (let i = 0; i < 3; i++) {
      const yy = cy - hh * 0.4 + i * hh * 0.4;
      g.drawPoly(0, 0, [cx - hw * 0.42, yy, cx, yy + hh * 0.22, cx, yy + hh * 0.22 + 2, cx - hw * 0.42, yy + 2], i % 2 === 0 ? shade(roof, 0.14) : shade(body, 0.08), null, 0);
    }
  }

  /** 按形态分派建筑绘制 */
  private drawBuilding(g: any, cx: number, cy: number, body: string, roof: string, style?: string): void {
    if (style === "field") { this.drawField(g, cx, cy, body, roof); return; }
    if (style === "wall") { this.drawWall(g, cx, cy); return; }
    this.drawHall(g, cx, cy, body, roof);
  }

  /** 地图房屋（白墙青瓦的仙剑村落样式） */
  private drawHouse(g: any, cx: number, cy: number): void {
    this.drawHall(g, cx, cy, "#e8e0cc", "#3f4d5a");
  }

  /** 树：等距 billboard 古松（树干 + 多层叠绿树冠 + 接地阴影） */
  private drawTree(g: any, cx: number, cy: number): void {
    const hw = TILE_W / 2, hh = TILE_H / 2;
    g.drawEllipse(cx, cy + hh * 0.6, TILE_W * 0.34, TILE_H * 0.8, "rgba(0,0,0,0.22)", null, 0);
    g.drawRect(cx - 3, cy - 16, 6, 18, "#5a4632", null, 0);
    g.drawCircle(cx, cy - 26, 15, "#2f4d2c", null, 0);
    g.drawCircle(cx - 9, cy - 32, 10, "#3d5a3a", null, 0);
    g.drawCircle(cx + 9, cy - 30, 9, "#446344", null, 0);
  }

  /** 招牌：朱底金边牌匾 + 图标（图标由 drawIcon 绘制，规避字体光栅化依赖） */
  private drawPlaque(g: any, cx: number, topY: number, drawIcon: (gg: any, x: number, y: number) => void): void {
    const w = 24, hh = 8;
    g.drawPoly(0, 0, [cx - w / 2, topY - hh, cx + w / 2, topY - hh, cx + w / 2, topY + hh, cx - w / 2, topY + hh], "#3a2a1a", "#caa64a", 1.5);
    drawIcon(g, cx, topY);
  }

  /** 铁匠铺：石砌炉台 + 跳动炉膛 + 铁砧（俯视） */
  private drawSmith(g: any, cx: number, cy: number): void {
    this.drawHall(g, cx, cy, "#4a4a52", "#2c2c34");
    // 炉膛火光
    g.drawCircle(cx, cy - TILE * 0.04, 4, "#ff7a2e", "#ffcf8a", 1);
    // 铁砧
    g.drawRect(cx - 8, cy + TILE * 0.10, 16, 5, "#2a2a30", "#555", 1);
  }

  /** 药店：药柜墙 + 悬葫芦（俯视） */
  private drawApothecary(g: any, cx: number, cy: number): void {
    this.drawHall(g, cx, cy, "#6b5536", "#4f3f28");
    // 葫芦
    g.drawCircle(cx - 4, cy + TILE * 0.02, 4, "#3f8f6a", "#1f5a40", 1);
    g.drawCircle(cx - 4, cy - TILE * 0.10, 2.6, "#3f8f6a", "#1f5a40", 1);
  }

  /** 民居：白墙青玉琉璃瓦 + 朱红院门（区别于普通房屋） */
  private drawResidence(g: any, cx: number, cy: number): void {
    this.drawHall(g, cx, cy, "#efe7d3", "#2f6b5e", "#8b2f2a");
  }

  /** 石砌围墙（等距矮墙段，带顶/两侧受光与接地影） */
  private drawWall(g: any, cx: number, cy: number): void {
    const hw = TILE_W / 2, hh = TILE_H / 2;
    const h = 12;
    const top = cy - h;
    g.drawPoly(0, 0, [cx - hw, top, cx, top + hh, cx, cy + hh, cx - hw, cy], shade("#9a9c96", 0.10), null, 0);
    g.drawPoly(0, 0, [cx, top + hh, cx + hw, top, cx + hw, cy, cx, cy + hh], shade("#9a9c96", -0.16), null, 0);
    g.drawPoly(0, 0, [cx, top - hh, cx + hw, top, cx, top + hh, cx - hw, top], shade("#9a9c96", 0.22), null, 0);
  }

  private drawArenaRing(g: any, cx: number, cy: number): void {
    g.drawCircle(cx, cy, 30, "rgba(155,34,38,0.25)", "#9b2226", 2);
    g.drawCircle(cx, cy, 18, "rgba(0,0,0,0.2)", null, 0);
  }

  /** 每帧 Y-sort：等距按 (gx+gy) 升序（越靠北/远越小，先画后被前景覆盖），同值再按 gy */
  resort(entries: { sprite: any; gx: number; gy: number }[]): void {
    const sorted = entries.slice().sort((a, b) => (a.gx + a.gy) - (b.gx + b.gy) || (a.gy - b.gy));
    for (let i = 0; i < sorted.length; i++) {
      sorted[i].sprite.zOrder = i;
    }
    if (typeof this.actorLayer.sortChildren === "function") this.actorLayer.sortChildren();
  }

  /**
   * 世界像素包围盒（等距投影下真实范围，含半格余量）。
   * 等距投影 x=(gx-gy)*TILE_W/2 会产生负值（地图左下 iso 角 x 低至 -(h-1)*TILE_W/2），
   * 故不能用 (0,0)-(worldW,worldH) 那种「从原点起算」的包围盒，否则相机钳制原点错配，
   * 地图左右两端 iso 角永远在视口外、玩家走到那里直接出屏（表现为「地图走不全 / 角落去不了」）。
   */
  worldBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
    const W = this.map.w;
    const H = this.map.h;
    const hw = TILE_W / 2, hh = TILE_H / 2;
    const OVER = 96; // 顶部建筑/角色向上悬空余量（避免屏幕顶边裁切）
    // 等距菱形包围盒：x=(gx-gy)*hw ∈ [-(H-1)hw, (W-1)hw]；y=(gx+gy)*hh ∈ [0, (W-1+H-1)hh]
    return {
      minX: -(H - 1) * hw - 60,
      maxX: (W - 1) * hw + 60,
      minY: -OVER,
      maxY: (W - 1 + H - 1) * hh + 60,
    };
  }

  /** 网格 → 世界像素（等价于模块函数 gridToScreen；供测试/外部读取投影） */
  worldOf(gx: number, gy: number): { x: number; y: number } {
    return gridToScreen(gx, gy);
  }

  /**
   * 画布坐标 → 世界网格：严格反演 updateCamera 里的 root 变换
   *   root.scale(Z, Z)，Z = zoom * cam.zoomMul
   *   root.pos(-cam*zoom - pivot*(Z-zoom), ...)，pivot 为缩放锚点（玩家世界像素）
   * 旧式 `canvasX/zoom + cam` 只在 zoomMul===1 时成立，Boss 登场/击杀的推拉镜头期间会整体偏移。
   * zoomMul===1 时本式与旧式完全等价（ pivot 项系数为 0 ）。
   */
  pick(canvasX: number, canvasY: number, cam: Camera, pivot?: { x: number; y: number }): { gx: number; gy: number } {
    const Z = this.zoom * (cam.zoomMul || 1);
    const rootX = -cam.x * this.zoom - (pivot ? pivot.x : 0) * (Z - this.zoom);
    const rootY = -cam.y * this.zoom - (pivot ? pivot.y : 0) * (Z - this.zoom);
    const wx = (canvasX - rootX) / Z;
    const wy = (canvasY - rootY) / Z;
    // 等距：screenToGrid 为 gridToScreen 的逆变换（就近取整到最近菱形瓦片中心），光标准确
    return screenToGrid(wx, wy);
  }

  addActor(sprite: any): void {
    this.actorLayer.addChild(sprite);
  }

  removeActor(sprite: any): void {
    this.actorLayer.removeChild(sprite);
  }
}
