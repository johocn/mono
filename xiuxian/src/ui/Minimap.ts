/**
 * 右上角小地图：俯视网格缩略图 + 角色/怪物/建筑点位 + 点击导航。
 * 与等距主视图解耦（简化为俯视网格），点击换算回网格坐标让玩家寻路前往。
 */
import { type MapDef, type TileKind } from "../data/map";
import { text } from "./widgets";

const CELL = 5;
const PAD = 4;

const TILE_TINT: Record<TileKind, string> = {
  grass: "#3c5735",
  path: "#6f6a58",
  water: "#2e4a5e",
  arena: "#7a6038",
  house: "#8a7a5f",
  tree: "#34502f",
  sand: "#b9a06a",
  reef: "#566b6e",
  portal: "#2e6b8a",
  smith: "#8a4a3a",
  shop: "#3f7d5e",
  residence: "#9a8a66",
  wall: "#7d7568",
};

export class Minimap {
  readonly root: any = new Laya.Sprite();
  private dots: any = new Laya.Sprite();
  private w = 0;
  private h = 0;
  private map!: MapDef;
  private titleText: any;

  constructor(map: MapDef, title = "地图") {
    this.root.addChild(this.dots);
    this.titleText = text(title, { size: 11, color: "#cfd6e6", bold: true });
    this.titleText.pos(PAD, -14);
    this.root.addChild(this.titleText);
    this.setMap(map, title);
    this.root.visible = true;
  }

  /** 切换区域时重绘地形并更新尺寸 */
  setMap(map: MapDef, title = "地图"): void {
    this.map = map;
    this.w = map.w * CELL + PAD * 2;
    this.h = map.h * CELL + PAD * 2;
    this.root.size(this.w, this.h);
    const g = this.root.graphics;
    g.clear();
    g.drawRoundRect(0, 0, this.w, this.h, 6, 6, 6, 6, "#0d1320dd", "#3a4a6a", 1);
    for (let gy = 0; gy < map.h; gy++) {
      for (let gx = 0; gx < map.w; gx++) {
        const kind = map.kinds[gy][gx];
        g.drawRect(PAD + gx * CELL, PAD + gy * CELL, CELL, CELL, TILE_TINT[kind] || TILE_TINT.grass, null, 0);
      }
    }
    if (this.titleText) this.titleText.text = title;
  }

  layout(viewW: number, viewH: number): void {
    this.root.x = viewW - this.w - 16;
    this.root.y = 104; // 紧贴任务面板下方
  }

  update(
    player: { gx: number; gy: number },
    monsters: { gx: number; gy: number; isBoss?: boolean }[],
    npcs: { gx: number; gy: number }[],
    built: { gx: number; gy: number }[],
  ): void {
    const g = this.dots.graphics;
    g.clear();
    for (const b of built) this.dot(g, b.gx, b.gy, "#9c7bd6", 2);
    for (const n of npcs) this.dot(g, n.gx, n.gy, "#ffd166", 2);
    for (const m of monsters) this.dot(g, m.gx, m.gy, m.isBoss ? "#ff4d4d" : "#ff7a7a", m.isBoss ? 3 : 2);
    this.dot(g, player.gx, player.gy, "#ffffff", 2.5);
  }

  private dot(g: any, gx: number, gy: number, color: string, r: number): void {
    g.drawCircle(PAD + gx * CELL + CELL / 2, PAD + gy * CELL + CELL / 2, r, color, null, 0);
  }

  /** 屏幕坐标是否落在小地图内 */
  contains(sx: number, sy: number): boolean {
    return sx >= this.root.x && sx <= this.root.x + this.w && sy >= this.root.y && sy <= this.root.y + this.h;
  }

  /** 屏幕坐标 → 网格坐标（俯视换算） */
  toGrid(sx: number, sy: number): { gx: number; gy: number } {
    const lx = sx - this.root.x - PAD;
    const ly = sy - this.root.y - PAD;
    return { gx: Math.floor(lx / CELL), gy: Math.floor(ly / CELL) };
  }
}
