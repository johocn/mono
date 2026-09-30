import { Sprite, Text } from 'pixi.js';
import type { Geo, Pt } from './iso';
import { dia, win, up } from './iso';
import type { SpriteRequest, TextRequest } from './providers/proc';

/** [x,y][] → Pixi 扁平数组 */
export function ptsToPoly(pts: Pt[]): number[] {
  return pts.flat();
}

/** 闭合折线（首点追加到尾） */
export function polyline(pts: Pt[]): number[] {
  return pts.length === 0 ? [] : [...pts, pts[0]].flat();
}

/** 矩形 → 扁平数组（Pixi 用 rect(x,y,w,h) 更好，这里给测试与 SVG 复用） */
export function rectPath(x: number, y: number, w: number, h: number): number[] {
  return [x, y, x + w, y + h];
}

/** 地砖菱形（转发 iso.dia，统一入口便于调试面板替换皮肤几何） */
export function tileDiamond(cx: number, cy: number, geo: Geo, lift = 0): Pt[] {
  return dia(cx, cy, geo.hw, geo.hh, lift);
}

/** 墙面开窗（转发 iso.win） */
export function wallRect(P0: Pt, P1: Pt, h: number, u1: number, u2: number, v1: number, v2: number): Pt[] {
  return win(P0, P1, h, u1, u2, v1, v2);
}

/** 面上抬升（转发 iso.up） */
export function liftPt(p: Pt, h: number): Pt {
  return up(p, h);
}

/** 按 preset 的文字请求创建 Pixi Text（唯一建文字处） */
export function makeText(req: TextRequest): Text {
  const wrap = req.wrapW !== undefined;
  const t = new Text({
    text: req.text,
    style: {
      fontFamily: 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif',
      fontSize: req.size,
      fontWeight: 'bold',
      fill: req.fill,
      ...(wrap ? { wordWrap: true, wordWrapWidth: req.wrapW, breakWords: true, align: 'center' } : {}),
    },
  });
  t.anchor.set(req.align === 'left' ? 0 : 0.5, 0.5);
  t.position.set(req.x, req.y);
  t.rotation = ((req.rotate ?? 0) * Math.PI) / 180;
  return t;
}

/** 按 provider 的图片请求创建 Pixi Sprite（唯一建精灵处） */
export function makeSprite(req: SpriteRequest): Sprite {
  const sp = new Sprite(req.texture);
  const [ax, ay] = req.anchor ?? [0.5, 0.5];
  sp.anchor.set(ax, ay);
  sp.position.set(req.x, req.y);
  sp.width = req.w;
  sp.height = req.h;
  sp.rotation = ((req.rotate ?? 0) * Math.PI) / 180;
  return sp;
}