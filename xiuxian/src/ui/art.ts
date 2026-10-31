/**
 * 美术资源绘制助手：把立绘 / 舆图绘制到指定矩形内。
 *
 * cover  = 居中裁切填充（头像类，画面填满，溢出边角可忽略）
 * contain = 完整居中放入（立绘 / 舆图类，希望整幅可见）
 *
 * 资源未就绪时绘制占位色块并返回 false，上层据此回退到程序化绘制。
 */
import { artTexture } from "../core/Assets";

export type ArtFit = "cover" | "contain";

export function drawArt(
  g: any,
  url: string,
  x: number,
  y: number,
  w: number,
  h: number,
  fallback: string,
  fit: ArtFit = "cover",
  radius = 10,
): boolean {
  const t = artTexture(url);
  g.drawRoundRect(x, y, w, h, radius, radius, radius, radius, fallback, null, 0);
  if (!t) {
    g.drawRoundRect(x, y, w, h, radius, radius, radius, radius, null, "#ffffff22", 1);
    return false;
  }
  const tw = Math.max(1, Number((t as any).width || (t as any).sourceWidth || 1) || 1);
  const th = Math.max(1, Number((t as any).height || (t as any).sourceHeight || 1) || 1);
  const k = fit === "cover" ? Math.max(w / tw, h / th) : Math.min(w / tw, h / th);
  const dw = tw * k;
  const dh = th * k;
  g.drawTexture(t, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  g.drawRoundRect(x, y, w, h, radius, radius, radius, radius, null, "#ffffff33", 1);
  return true;
}
