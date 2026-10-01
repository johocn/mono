import type { Graphics } from 'pixi.js';
import { c, fb, num } from './proc-base';
import type { ProcCtx } from './proc';

type P = Record<string, unknown>;

/**
 * L4 内建兜底（spec §6.7）：暖白底 `#fff7e6` + 金边，与深底名牌**反相**，
 * 天然区分「静态名牌 / 瞬时气泡」；下方三角指向棋子，箭头尖端正好落在 `ctx.cy`。
 *
 * 本文件唯一允许出现裸字面量的位置（`fb` 实参子树）；skin.json / theme.json 的 params 逐键覆盖。
 * 分工：几何/色值走 `params`（可换素材与配色），**动态文案走 `state`**
 * （标题 / 金额 / 四态主色键，与地砖的 `state.owner`、棋子的 `state.mood` 同口径）。
 */
const D = fb({
  w: 100,
  h: 44,
  rx: 8,
  fill: '#fff7e6',
  edge: '#f5c451',
  edgeW: 1.3,
  triW: 6.6,
  triH: 7,
  titleColor: '#241a12',
  titleSize: 11,
  titleDy: 17,
  amountSize: 10,
  amountDy: 31,
  /* 第三段：原著引文（`state.quote`）——定宽折行，每行 `quoteChars` 个汉字，最多 `quoteLines` 行 */
  quoteSize: 8,
  quoteChars: 11,
  quoteLines: 2,
  quoteLineH: 10,
  quotePadTop: 3,
  quoteColor: '#6b5a45',
  /* 五态主色（spec §6.7 表 + 前进播报；比主色盘更深一档，保证在暖白底上的可读性） */
  tonebuy: '#2f8f5e',
  tonerent: '#a8761c',
  tonecard: '#7b46d6',
  tonejail: '#c0392b',
  tonemove: '#2f6fbf',
});

/** 头顶事件气泡：暖白圆角底 + 指向三角 + 标题 / 金额 / 原著引文（引文缺省则退回两行旧观感） */
export function bubble(g: Graphics, ctx: ProcCtx): void {
  const p = ctx.params as P;
  const st = ctx.state as P;
  const n = (k: string): number => num(p, k, (D as P)[k] as number);
  const col = (k: string): string => c(p, k, (D as P)[k] as string);

  const s = ctx.s;
  const w = n('w') * s;
  /* 引文按 `quoteChars` 个汉字定宽折行（汉字等宽，无需量字宽），最多 `quoteLines` 行，超出末行补省略号 */
  const raw = typeof st.quote === 'string' ? st.quote : '';
  const perLine = n('quoteChars');
  const lineMax = n('quoteLines');
  const qLines: string[] = [];
  for (let i = 0; i < raw.length && qLines.length < lineMax; i += perLine) {
    qLines.push(raw.slice(i, i + perLine));
  }
  if (raw.length > perLine * lineMax && qLines.length === lineMax) {
    const last = qLines[lineMax - 1];
    qLines[lineMax - 1] = `${last.slice(0, Math.max(1, perLine - 1))}…`;
  }
  /* 气泡随引文行数向上长高：三角尖端不动，只把顶边抬高 */
  const h = (n('h') + qLines.length * n('quoteLineH')) * s;
  const tipY = ctx.cy;                          // 箭头尖端 = 定格台位
  const bodyBottom = tipY - n('triH') * s;
  const left = ctx.cx - w / 2;
  const top = bodyBottom - h;
  const edge = col('edge');
  const edgeW = n('edgeW') * s;

  /* 四态主色由 state.tone 选键（'buy'/'rent'/'card'/'jail' → D.tonebuy/…） */
  const tone = typeof st.tone === 'string' ? (st.tone as string) : 'buy';
  const toneColor = col(`tone${tone}`);

  g.roundRect(left, top, w, h, n('rx') * s).fill({ color: col('fill') }).stroke({ color: edge, width: edgeW });

  /* 三角：先填（上沿比底边高出 edgeW，盖住圆角底边框这道接缝）→ 再只描两条斜边（不描底边，避免气泡内多一条横线） */
  const triW = n('triW') * s;
  g.poly([ctx.cx - triW, bodyBottom - edgeW, ctx.cx + triW, bodyBottom - edgeW, ctx.cx, tipY])
    .fill({ color: col('fill') });
  g.moveTo(ctx.cx - triW, bodyBottom).lineTo(ctx.cx, tipY).lineTo(ctx.cx + triW, bodyBottom)
    .stroke({ color: toneColor, width: edgeW });

  ctx.text?.({ text: String(st.title ?? ''), x: ctx.cx, y: top + n('titleDy') * s, size: n('titleSize') * s, fill: col('titleColor') });
  ctx.text?.({ text: String(st.amount ?? ''), x: ctx.cx, y: top + n('amountDy') * s, size: n('amountSize') * s, fill: toneColor });
  qLines.forEach((line, i) => {
    ctx.text?.({
      text: line,
      x: ctx.cx,
      y: top + (n('amountDy') + n('quotePadTop') + (i + 1) * n('quoteLineH')) * s,
      size: n('quoteSize') * s,
      fill: col('quoteColor'),
    });
  });
}
