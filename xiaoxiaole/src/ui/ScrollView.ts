/**
 * ScrollView — Canvas 长列表滚动容器（适老化）
 *
 * 背景：整页只有一个 canvas（touch-action:none），没有原生滚动条，
 * 长列表必须自己维护偏移量。本类只负责「偏移状态 + 滚动条绘制」，
 * 内容裁剪由 GameCanvas.setClip() 完成，命中判定由场景自行加上 offsetY。
 *
 * 用法：
 *   // 每帧
 *   scroll.begin(viewH, contentH);            // 登记视口/内容高度并夹紧
 *   gameCanvas.setClip(listRect);             // 裁剪可视区
 *   ...绘制内容时 y -= scroll.offsetY...
 *   gameCanvas.setClip(null);
 *   scroll.drawScrollbar(w - 8, listY, viewH); // 右侧滚动条
 *   // 指针移动
 *   gameCanvas.setScrollHandler((_dx, dy) => scroll.scrollBy(dy));
 */

import { gameCanvas } from "./GameCanvas";

export interface ScrollRect { x: number; y: number; w: number; h: number }

export class ScrollView {
  private offset = 0;
  private maxOffset = 0;
  private viewH = 0;
  private contentH = 0;

  /**
   * 每帧绘制内容前调用。
   * @param viewH 可视区高度
   * @param contentH 内容总高度
   */
  begin(viewH: number, contentH: number): void {
    this.viewH = Math.max(1, viewH);
    this.contentH = contentH;
    this.maxOffset = Math.max(0, contentH - viewH);
    if (this.offset > this.maxOffset) this.offset = this.maxOffset;
    if (this.offset < 0) this.offset = 0;
  }

  /** 当前滚动偏移（内容绘制时 y 需要减去它） */
  get offsetY(): number { return this.offset; }
  get maxScroll(): number { return this.maxOffset; }
  get canScroll(): boolean { return this.maxOffset > 2; }
  get atTop(): boolean { return this.offset <= 1; }
  get atBottom(): boolean { return this.offset >= this.maxOffset - 1; }

  /** 手指位移（上滑 dy<0）→ 内容随手指上移 */
  scrollBy(dy: number): void {
    this.offset = Math.max(0, Math.min(this.maxOffset, this.offset - dy));
  }

  /** 切换分类 / 重进场景时回到顶部 */
  reset(): void {
    this.offset = 0;
    this.maxOffset = 0;
    this.viewH = 0;
    this.contentH = 0;
  }

  /**
   * 右侧滚动条：常驻细条 + 滑块，让「下面还有内容」变成可见信号。
   * 不可滚动时不绘制，避免干扰。
   */
  drawScrollbar(x: number, y: number, h: number): void {
    if (!this.canScroll) return;
    const trackW = 6;
    const trackX = x - trackW;
    gameCanvas.drawRoundRect(trackX, y, trackW, h, 3, "rgba(255,255,255,0.10)", 92);

    const ratio = this.viewH / this.contentH;
    const thumbH = Math.max(28, h * ratio);
    const travel = h - thumbH;
    const thumbY = y + (this.maxOffset > 0 ? (this.offset / this.maxOffset) * travel : 0);
    gameCanvas.drawRoundRect(trackX, thumbY, trackW, thumbH, 3, "rgba(78,205,196,0.75)", 93);
  }
}
