/**
 * 通用棋盘渲染 — 等轴 3D 风格棋子
 *
 * 三大模式共用，按 mode 切换渲染样式。
 *
 * 动画支持：每个 TileVisual 可携带平移 / 缩放 / 旋转 / 透明度 / 发光强度，
 * 全部在 `drawTile` 内通过 ctx.save()+transform 应用，调用方（场景）只负责
 * 计算每帧的数值。z 序按行递增，保证「下落在上方棋子之下」的层叠关系。
 */

import { gameCanvas, GameCanvas } from "./GameCanvas";
import { GAME_CONFIG } from "../core/GameConfig";
import { safety } from "../core/SafetyManager";
import { skinManager } from "../core/SkinManager";
import { clamp01 } from "../core/Tween";
import type { SpecialKind } from "../modes/Match3Engine";

/** 与 GameCanvas.BREATH_PERIOD_MS 对齐的呼吸相位（0..1） */
function breathPhase(time: number): number {
  return (Math.sin((time / (GameCanvas.BREATH_PERIOD_MS / 2)) * Math.PI) + 1) / 2;
}

export interface TileVisual {
  type: string;          // icon type or text
  label: string;         // 显示文字
  color: string;
  hidden: boolean;       // audio mode: 图标隐藏
  frozen: boolean;       // match3: 冰冻格
  obstacle?: "frozen" | "chained" | "blackhole" | null;  // match3: 障碍视觉类型
  jelly?: boolean;       // match3: 果冻层（覆盖在棋子下方，消除即清除）
  matched: boolean;      // 已消除（不绘制棋子本体）
  highlighted: boolean;  // 呼吸灯高亮
  selected: boolean;
  special?: SpecialKind | null; // 特效棋子：直线火箭 / 同色炸弹 / 鱼

  // --- 可选动画通道（默认值：偏移 0 / 缩放 1 / 透明 1 / 旋转 0） ---
  offsetX?: number;      // 像素位移（滑动、下落）
  offsetY?: number;
  scale?: number;
  alpha?: number;
  rotation?: number;     // 弧度
  glow?: number;         // 0-1 额外发光强度（选中脉冲）
}

/** 顶部 HUD 占位高度 */
export const BOARD_TOP_INSET = 92;
/** 底部道具栏占位高度 */
export const BOARD_BOTTOM_INSET = 104;

export class Board {
  private cols: number;
  private rows: number;
  private tileSize: number = 0;
  private offsetX: number = 0;
  private offsetY: number = 0;
  private tiles: TileVisual[][] = [];
  private time: number = 0;
  private unsubscribeResize: (() => void) | null = null;

  constructor(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.calcLayout();
    // 尺寸变化（旋转屏幕 / 窗口缩放）后重算布局，否则渲染与命中判定都会错位
    this.unsubscribeResize = gameCanvas.onResize(() => this.calcLayout());
  }

  destroy(): void {
    this.unsubscribeResize?.();
    this.unsubscribeResize = null;
    this.tiles = [];
  }

  /** 棋盘格子边长（含适老化最小点击区校验） */
  calcLayout(): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    const availW = w * 0.92;
    const availH = Math.max(120, h - BOARD_TOP_INSET - BOARD_BOTTOM_INSET);

    let size = Math.floor(Math.min(availW / this.cols, availH / this.rows));
    // 下限取适老化最小点击区，上限避免超大屏棋子过大
    size = Math.max(GAME_CONFIG.minTapSize, Math.min(size, 96));
    this.tileSize = size;

    const boardW = size * this.cols;
    const boardH = size * this.rows;
    this.offsetX = (w - boardW) / 2;
    this.offsetY = BOARD_TOP_INSET + (availH - boardH) / 2;

    safety.assertTapSize(size, "board-tile");
  }

  setTiles(tiles: TileVisual[][]): void { this.tiles = tiles; }
  getTiles(): TileVisual[][] { return this.tiles; }
  getTileSize(): number { return this.tileSize; }
  getOffsetX(): number { return this.offsetX; }
  getOffsetY(): number { return this.offsetY; }
  getCols(): number { return this.cols; }
  getRows(): number { return this.rows; }

  setTime(t: number): void { this.time = t; }

  /** 屏幕坐标 → 棋盘格子坐标 */
  screenToGrid(x: number, y: number): { col: number; row: number } | null {
    const col = Math.floor((x - this.offsetX) / this.tileSize);
    const row = Math.floor((y - this.offsetY) / this.tileSize);
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return null;
    return { col, row };
  }

  /** 格子中心屏幕坐标 */
  gridToScreen(col: number, row: number): { x: number; y: number } {
    return {
      x: this.offsetX + col * this.tileSize + this.tileSize / 2,
      y: this.offsetY + row * this.tileSize + this.tileSize / 2,
    };
  }

  /** 棋盘外框（用于居中浮层） */
  getBoardRect(): { x: number; y: number; w: number; h: number } {
    return {
      x: this.offsetX,
      y: this.offsetY,
      w: this.tileSize * this.cols,
      h: this.tileSize * this.rows,
    };
  }

  /** 棋盘裁剪外扩量：刚好容纳选中/提示的放大与上浮，同时把「从盘外落入」的棋子藏住 */
  private static readonly CLIP_PAD = 14;

  draw(): void {
    const boardW = this.tileSize * this.cols;
    const boardH = this.tileSize * this.rows;

    // 棋盘底板：外发光 + 半透明面板（配色取自当前皮肤，未换肤时与默认一致）
    const boardStyle = skinManager.board();
    const boardImg = skinManager.boardImage();
    gameCanvas.draw((ctx) => {
      ctx.save();
      ctx.shadowColor = boardStyle.glow;
      ctx.shadowBlur = 24;
      ctx.fillStyle = boardStyle.base;
      ctx.beginPath();
      ctx.roundRect(this.offsetX - 10, this.offsetY - 10, boardW + 20, boardH + 20, 16);
      ctx.fill();
      ctx.restore();

      // 皮肤贴图：铺满底板（未加载完成时底色已由上方填充兜底）
      if (boardImg) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(this.offsetX - 10, this.offsetY - 10, boardW + 20, boardH + 20, 16);
        ctx.clip();
        ctx.drawImage(boardImg, this.offsetX - 10, this.offsetY - 10, boardW + 20, boardH + 20);
        ctx.restore();
      }

      ctx.strokeStyle = boardStyle.stroke;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(this.offsetX - 10, this.offsetY - 10, boardW + 20, boardH + 20, 16);
      ctx.stroke();
    }, 10);

    // 所有棋子合并为一次 draw call：
    // 1) 统一裁剪到棋盘范围，下落中「从盘外飘入」的棋子不会溢出棋盘框
    // 2) 行序绘制天然形成「下排压上排」的层叠纵深
    // 3) 避免每格一个闭包带来的每帧 GC 压力
    gameCanvas.draw((ctx) => {
      const pad = Board.CLIP_PAD;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(
        this.offsetX - pad,
        this.offsetY - pad,
        boardW + pad * 2,
        boardH + pad * 2,
        14,
      );
      ctx.clip();

      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const tile = this.tiles[r]?.[c];
          if (!tile) continue;
          this.paintCell(ctx, c, r, tile);
        }
      }

      ctx.restore();
    }, 20);
  }

  /** 在已裁剪的画布上绘制单个格子（含光晕 / 变换 / 提示环） */
  private paintCell(ctx: CanvasRenderingContext2D, col: number, row: number, tile: TileVisual): void {
    const { x, y } = this.gridToScreen(col, row);
    const s = this.tileSize;
    const alpha = clamp01(tile.alpha ?? 1);
    if (alpha <= 0.01) return;
    const scale = Math.max(0, tile.scale ?? 1);
    if (scale <= 0.01) return;
    const rot = tile.rotation ?? 0;
    const cx = x + (tile.offsetX ?? 0);
    const cy = y + (tile.offsetY ?? 0);

    // 黑洞障碍：吞噬一切的暗涡，盖住棋子本体（带呼吸脉冲）
    if (tile.obstacle === "blackhole") {
      this.paintBlackhole(ctx, s);
      return;
    }

    // 果冻层：覆盖在棋子下方的半透明彩色薄膜（在该格消除即清除一层）
    if (tile.jelly) {
      ctx.save();
      const pad = Math.max(2, s * 0.055);
      const box = s - pad * 2;
      const lx = cx - s / 2 + pad;
      const ly = cy - s / 2 + pad;
      const r = Math.max(4, s * 0.16);
      ctx.fillStyle = "rgba(120,200,255,0.30)";
      ctx.beginPath();
      ctx.roundRect(lx, ly, box, box, r);
      ctx.fill();
      ctx.strokeStyle = "rgba(150,220,255,0.85)";
      ctx.lineWidth = Math.max(2, s * 0.05);
      ctx.stroke();
      ctx.restore();
    }

    // 选中/连击：棋子下方的呼吸光晕
    if (tile.selected || (tile.glow ?? 0) > 0) {
      const glowColor = tile.selected ? "#ffffff" : tile.color;
      const glowStrength = tile.selected ? 1 : (tile.glow as number);
      const phase = safety.getEffectMode() === "reduced"
        ? 0.85
        : breathPhase(this.time) * 0.3 + 0.85;
      ctx.save();
      ctx.globalAlpha = alpha * (tile.selected ? 0.45 : glowStrength * 0.5);
      ctx.fillStyle = glowColor;
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.72 * phase, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 棋子本体
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    if (rot !== 0) ctx.rotate(rot);
    if (scale !== 1) ctx.scale(scale, scale);
    this.paintTile(ctx, tile, s);
    ctx.restore();

    // 空闲提示：绘制在棋子**之上**的脉冲描边环，保证一定可见（≤2Hz）
    if (tile.highlighted && !tile.matched) {
      safety.assertSafeHz(1000 / GameCanvas.BREATH_PERIOD_MS, "hint-ring");
      const reduced = safety.getEffectMode() === "reduced";
      // 用同一个周期常量驱动，避免「声明的 Hz」与「实际 Hz」漂移
      const phase = reduced ? 0.75 : breathPhase(this.time);
      const grow = 1 + phase * 0.12;
      const half = (s / 2) * grow * 0.96;
      ctx.save();
      ctx.globalAlpha = alpha * (0.5 + phase * 0.5);
      ctx.strokeStyle = tile.color;
      ctx.lineWidth = Math.max(3, s * 0.07);
      ctx.shadowColor = tile.color;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.roundRect(cx - half, cy - half, half * 2, half * 2, s * 0.2);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** 在 (0,0) 为中心的本地坐标系里绘制单枚棋子 */
  private paintTile(ctx: CanvasRenderingContext2D, tile: TileVisual, s: number): void {
    const half = s / 2;
    const pad = Math.max(2, s * 0.055);
    const box = s - pad * 2;
    const lx = -half + pad;
    const ly = -half + pad;
    const r = Math.max(4, s * 0.16);
    const depth = Math.max(3, s * 0.1);

    // --- 空格底槽 ---
    if (tile.matched) {
      ctx.fillStyle = "rgba(255,255,255,0.045)";
      ctx.beginPath();
      ctx.roundRect(lx, ly, box, box, r);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      ctx.stroke();
      return;
    }

    // --- 冰冻格 ---
    if (tile.frozen) {
      // 冰面底色（比空格亮得多，避免被误读成「已消除」）
      const ice = ctx.createLinearGradient(0, -half, 0, half);
      ice.addColorStop(0, "rgba(196,238,255,0.55)");
      ice.addColorStop(0.5, "rgba(138,206,245,0.40)");
      ice.addColorStop(1, "rgba(96,170,220,0.45)");
      ctx.fillStyle = ice;
      ctx.beginPath();
      ctx.roundRect(lx, ly, box, box, r);
      ctx.fill();

      // 斜向冰裂纹理
      ctx.strokeStyle = "rgba(235,250,255,0.55)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI;
        ctx.moveTo(lx + box / 2 - Math.cos(a) * box * 0.44, ly + box / 2 - Math.sin(a) * box * 0.44);
        ctx.lineTo(lx + box / 2 + Math.cos(a) * box * 0.44, ly + box / 2 + Math.sin(a) * box * 0.44);
      }
      ctx.stroke();

      // 高光棱角
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath();
      ctx.moveTo(lx + box * 0.12, ly + box * 0.1);
      ctx.lineTo(lx + box * 0.62, ly + box * 0.1);
      ctx.lineTo(lx + box * 0.12, ly + box * 0.62);
      ctx.closePath();
      ctx.fill();

      // 冰框
      ctx.strokeStyle = "rgba(225,248,255,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(lx, ly, box, box, r);
      ctx.stroke();

      ctx.font = `bold ${Math.round(s * 0.34)}px "Microsoft YaHei", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(20,60,90,0.55)";
      ctx.strokeText("❄", 0, s * 0.02);
      ctx.fillStyle = "#ffffff";
      ctx.fillText("❄", 0, s * 0.02);
      return;
    }

    // --- 隐藏态（听音模式未揭示） ---
    if (tile.hidden) {
      ctx.fillStyle = "rgba(70,74,112,0.85)";
      ctx.beginPath();
      ctx.roundRect(lx, ly + depth * 0.6, box, box, r);
      ctx.fill();
      ctx.fillStyle = "rgba(92,98,142,0.95)";
      ctx.beginPath();
      ctx.roundRect(lx, ly, box, box, r);
      ctx.fill();
      ctx.font = `bold ${Math.round(s * 0.4)}px "Microsoft YaHei", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(200,205,235,0.8)";
      ctx.fillText("?", 0, s * 0.02);
      return;
    }

    // --- 皮肤贴图棋子：有贴图时直接铺图，跳过 3D 色块 ---
    const skinImg = skinManager.tileImage(tile.type);
    if (skinImg) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(lx, ly, box, box, r);
      ctx.clip();
      ctx.drawImage(skinImg, lx, ly, box, box);
      ctx.restore();
      // 顶部高光条：与 3D 棋子保持一致的受光感
      ctx.fillStyle = "rgba(255,255,255,0.32)";
      ctx.beginPath();
      ctx.roundRect(lx + box * 0.14, ly + box * 0.1, box * 0.72, box * 0.2, r * 0.6);
      ctx.fill();
      this.paintTileFace(ctx, tile, s, lx, ly, box, r);
      return;
    }

    // --- 等轴 3D 棋子 ---

    // 落地阴影
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.roundRect(lx + 1.5, ly + depth, box, box, r);
    ctx.fill();

    // 侧面（厚度）
    ctx.fillStyle = tile.color;
    ctx.beginPath();
    ctx.roundRect(lx, ly + depth, box, box, r);
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.34)";
    ctx.beginPath();
    ctx.roundRect(lx, ly + depth, box, box, r);
    ctx.fill();

    // 顶面
    ctx.fillStyle = tile.color;
    ctx.beginPath();
    ctx.roundRect(lx, ly, box, box, r);
    ctx.fill();

    // 顶面渐变（上亮下暗，制造受光感）
    const grad = ctx.createLinearGradient(0, -half, 0, half);
    grad.addColorStop(0, "rgba(255,255,255,0.42)");
    grad.addColorStop(0.42, "rgba(255,255,255,0.07)");
    grad.addColorStop(1, "rgba(0,0,0,0.16)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(lx, ly, box, box, r);
    ctx.fill();

    // 顶部高光条
    ctx.fillStyle = "rgba(255,255,255,0.32)";
    ctx.beginPath();
    ctx.roundRect(lx + box * 0.14, ly + box * 0.1, box * 0.72, box * 0.2, r * 0.6);
    ctx.fill();

    this.paintTileFace(ctx, tile, s, lx, ly, box, r);
  }

  /**
   * 棋子「表面层」：文字标签 + 选中描边 + 障碍遮罩。
   * 3D 色块与皮肤贴图两条路径共用，保证换肤后文字与可点击反馈完全一致。
   */
  private paintTileFace(
    ctx: CanvasRenderingContext2D, tile: TileVisual,
    s: number, lx: number, ly: number, box: number, r: number,
  ): void {
    // 文字标签：按字数自适应字号，保证诗词模式的多字标签不会溢出棋子
    if (tile.label) {
      const chars = Math.max(1, [...tile.label].length);
      const maxTextW = box * 0.96;
      const fontPx = Math.max(10, Math.round(Math.min(s * 0.38, maxTextW / chars)));
      ctx.font = `bold ${fontPx}px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(0,0,0,0.32)";
      ctx.fillText(tile.label, 0, s * 0.035);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(tile.label, 0, s * 0.02);
    }

    // 选中：白色描边
    if (tile.selected) {
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.lineWidth = Math.max(2.5, s * 0.055);
      ctx.beginPath();
      ctx.roundRect(lx - 2, ly - 2, box + 4, box + 4, r + 2);
      ctx.stroke();
    }

    // 锁链障碍：在棋子之上叠加锁链遮罩，提示「需相邻消除解锁」
    if (tile.obstacle === "chained") {
      this.paintChain(ctx, s);
    }

    // 特效棋子遮罩：提示「四连/五连生成、可触发范围消除」
    if (tile.special) {
      this.paintSpecial(ctx, s, tile.special);
    }
  }

  /** 特效棋子遮罩（局部坐标系，中心在 0,0） */
  private paintSpecial(ctx: CanvasRenderingContext2D, s: number, kind: SpecialKind): void {
    const half = s / 2;
    const pad = Math.max(2, s * 0.055);
    const box = s - pad * 2;
    const lx = -half + pad;
    const ly = -half + pad;
    const r = Math.max(4, s * 0.16);
    ctx.save();
    if (kind === "lineH" || kind === "lineV") {
      // 直线火箭：透明光柱 + 方向箭头
      ctx.fillStyle = "rgba(255,255,255,0.30)";
      if (kind === "lineH") {
        ctx.fillRect(lx, -box * 0.08, box, box * 0.16);
      } else {
        ctx.fillRect(-box * 0.08, ly, box * 0.16, box);
      }
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.lineWidth = Math.max(2, s * 0.05);
      ctx.beginPath();
      ctx.roundRect(lx - 2, ly - 2, box + 4, box + 4, r + 2);
      ctx.stroke();
      ctx.font = `bold ${Math.round(box * 0.5)}px "Microsoft YaHei", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "rgba(20,20,40,0.6)";
      ctx.lineWidth = 3;
      const glyph = kind === "lineH" ? "↔" : "↕";
      ctx.strokeText(glyph, 0, s * 0.02);
      ctx.fillText(glyph, 0, s * 0.02);
    } else if (kind === "wrap") {
      // 包装炸弹：3×3 格纹 + 高亮星标
      ctx.fillStyle = "rgba(255,255,255,0.30)";
      const g = box / 3;
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          if ((i + j) % 2 === 0) ctx.fillRect(lx + i * g, ly + j * g, g, g);
        }
      }
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.lineWidth = Math.max(2, s * 0.05);
      ctx.beginPath();
      ctx.roundRect(lx - 2, ly - 2, box + 4, box + 4, r + 2);
      ctx.stroke();
      ctx.font = `bold ${Math.round(box * 0.5)}px "Microsoft YaHei", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fff2a0";
      ctx.strokeStyle = "rgba(20,20,40,0.6)";
      ctx.lineWidth = 3;
      ctx.strokeText("✸", 0, s * 0.02);
      ctx.fillText("✸", 0, s * 0.02);
    } else if (kind === "fish") {
      // 鱼：随机游动清子（Candy Crush 招牌机制）
      ctx.fillStyle = "rgba(120,220,255,0.35)";
      ctx.beginPath();
      ctx.roundRect(lx - 2, ly - 2, box + 4, box + 4, r + 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.lineWidth = Math.max(2, s * 0.05);
      ctx.beginPath();
      ctx.roundRect(lx - 2, ly - 2, box + 4, box + 4, r + 2);
      ctx.stroke();
      ctx.font = `bold ${Math.round(box * 0.5)}px "Microsoft YaHei", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🐟", 0, s * 0.02);
    } else {
      // 同色炸弹：彩虹光环 + 星标
      const phase = breathPhase(this.time);
      const radius = half * 0.74;
      const ring = ctx.createRadialGradient(0, 0, radius * 0.3, 0, 0, radius * 1.25);
      ring.addColorStop(0, `rgba(255,240,150,${0.5 + phase * 0.2})`);
      ring.addColorStop(0.5, "rgba(255,120,200,0.35)");
      ring.addColorStop(1, "rgba(120,180,255,0)");
      ctx.fillStyle = ring;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 1.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,240,160,0.95)";
      ctx.lineWidth = Math.max(2, s * 0.05);
      ctx.beginPath();
      ctx.roundRect(lx - 2, ly - 2, box + 4, box + 4, r + 2);
      ctx.stroke();
      ctx.font = `bold ${Math.round(box * 0.5)}px "Microsoft YaHei", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fff7c0";
      ctx.strokeStyle = "rgba(20,20,40,0.6)";
      ctx.lineWidth = 3;
      ctx.strokeText("★", 0, s * 0.02);
      ctx.fillText("★", 0, s * 0.02);
    }
    ctx.restore();
  }

  /** 锁链遮罩（局部坐标系，中心在 0,0） */
  private paintChain(ctx: CanvasRenderingContext2D, s: number): void {
    const half = s / 2;
    const pad = Math.max(2, s * 0.055);
    const box = s - pad * 2;
    const lx = -half + pad;
    const ly = -half + pad;
    const r = Math.max(4, s * 0.16);
    ctx.save();
    ctx.fillStyle = "rgba(18,20,36,0.40)";
    ctx.beginPath();
    ctx.roundRect(lx, ly, box, box, r);
    ctx.fill();
    ctx.strokeStyle = "rgba(196,200,220,0.85)";
    ctx.lineWidth = Math.max(2, box * 0.06);
    ctx.beginPath();
    ctx.roundRect(lx + box * 0.1, ly + box * 0.1, box * 0.8, box * 0.8, box * 0.12);
    ctx.stroke();
    ctx.font = `bold ${Math.round(box * 0.42)}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillText("🔗", 0, s * 0.02);
    ctx.restore();
  }

  /** 黑洞暗涡（局部坐标系，中心在 0,0），带呼吸脉冲营造「吞噬」感 */
  private paintBlackhole(ctx: CanvasRenderingContext2D, s: number): void {
    const half = s / 2;
    const phase = breathPhase(this.time);
    const radius = half * (0.78 + phase * 0.06);
    ctx.save();
    // 外层紫色光晕
    const halo = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius * 1.4);
    halo.addColorStop(0, "rgba(120,60,180,0.55)");
    halo.addColorStop(1, "rgba(120,60,180,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.4, 0, Math.PI * 2);
    ctx.fill();
    // 黑色涡心
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    core.addColorStop(0, "#05060c");
    core.addColorStop(0.7, "#0b0e1a");
    core.addColorStop(1, "rgba(20,12,40,0.9)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    // 旋转吸积环（用相位驱动伪旋转）
    ctx.strokeStyle = `rgba(180,140,255,${0.5 + phase * 0.3})`;
    ctx.lineWidth = Math.max(2, s * 0.05);
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 0.9, radius * 0.42, phase * Math.PI, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
