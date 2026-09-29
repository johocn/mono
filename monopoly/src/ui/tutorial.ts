/**
 * 新手分步蒙层（spec §7）：DOM overlay，`z-index: 20`（低于开局面板 30、高于 hud 8 / panels 9）。
 * 仅蒙层与气泡吃事件；引导结束才放开游戏动作。不引入任何 `src/render/**` 依赖。
 */
import { TUTORIAL_STEPS } from '../data/tutorial';
import { STAGE_H, STAGE_W, TUTORIAL_GAP } from '../skin/layout';
import type { Seat } from '../data/ai';

export type { Rect } from '../data/tutorial';

const TOUR_KEY = 'mono.tour.done';
const Z_TOUR = 20;
const FONT = '-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif';
/** 挖洞法：高亮框外全部压暗（一层 box-shadow 即盖住整屏，无需逐块拼蒙层） */
const DIM = 'box-shadow:0 0 0 9999px rgba(4,8,6,.72)';

export function markDone(): void { try { localStorage.setItem(TOUR_KEY, '1'); } catch { /* 隐私模式忽略 */ } }
export function isDone(): boolean { try { return localStorage.getItem(TOUR_KEY) === '1'; } catch { return false; } }

/** `?tour=1` 强制 / `?tour=0` 关闭 / 缺省首访一次；纯 AI 局不弹（spec §7.1） */
export function shouldShowTutorial(opts: { tour?: boolean }, done: boolean, seats: readonly Seat[]): boolean {
  if (!seats.some((s) => s === null)) return false;
  if (opts.tour === false) return false;
  if (opts.tour === true) return true;
  return !done;
}

export interface TutorialHandle { next(): void; skip(): void; index(): number; destroy(): void }

export function mountTutorial(root: HTMLElement, deps: { onDone?: () => void } = {}): TutorialHandle {
  let index = 0;
  let finished = false;

  const layer = document.createElement('div');
  layer.id = 'mono-tour';
  layer.style.cssText =
    `position:fixed;left:0;top:0;width:${STAGE_W}px;height:${STAGE_H}px;` +
    `z-index:${Z_TOUR};pointer-events:none;font:13px/1.5 ${FONT};color:#d8e4dc`;

  const finish = (): void => {
    if (finished) return;
    finished = true;
    markDone();
    layer.remove();
    deps.onDone?.();
  };

  const render = (): void => {
    layer.textContent = '';
    const step = TUTORIAL_STEPS[index];
    const box = document.createElement('div');
    box.dataset.tourStep = String(index);
    box.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%';

    /* 高亮框：透明底 + 巨型外阴影把框外压暗 */
    let top = STAGE_H;
    for (const r of step.rects) {
      const hl = document.createElement('div');
      hl.style.cssText =
        `position:absolute;left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;` +
        'border-radius:10px;' + DIM;
      box.appendChild(hl);
      if (r.y < top) top = r.y;
    }

    /* 气泡：落在最高高亮框的上方（贴顶则改放下方），左右留 TUTORIAL_GAP */
    const bubble = document.createElement('div');
    const above = top > STAGE_H / 2;
    const pos = above
      ? `bottom:${STAGE_H - top + TUTORIAL_GAP}px`
      : `top:${Math.max(...step.rects.map((r) => r.y + r.h)) + TUTORIAL_GAP}px`;
    bubble.style.cssText =
      `position:absolute;left:${TUTORIAL_GAP}px;right:${TUTORIAL_GAP}px;${pos};` +
      'pointer-events:auto;background:#0f1a16;border:1px solid #3a4a42;border-radius:12px;padding:12px 14px';

    const title = document.createElement('div');
    title.textContent = step.title;
    title.style.cssText = 'font-size:14px;font-weight:700;color:#f5c451';
    const text = document.createElement('div');
    text.textContent = step.text;
    text.style.cssText = 'margin-top:4px;font-size:12px;line-height:1.6;color:#9fb3a9';
    bubble.appendChild(title);
    bubble.appendChild(text);

    const row = document.createElement('div');
    row.style.cssText = 'margin-top:10px;display:flex;gap:8px;justify-content:flex-end';
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.dataset.action = 'tour:skip';
    skip.textContent = '跳过';
    skip.style.cssText =
      'padding:8px 12px;border-radius:9px;cursor:pointer;border:1px solid #3a4a42;' +
      'background:rgba(6,12,10,.65);color:#9fb3a9;font:12px/1.2 inherit';
    skip.onclick = (): void => { finish(); };
    const next = document.createElement('button');
    next.type = 'button';
    next.dataset.action = 'tour:next';
    next.textContent = index === TUTORIAL_STEPS.length - 1 ? '开始' : '下一步';
    next.style.cssText =
      'padding:8px 14px;border-radius:9px;cursor:pointer;border:0;' +
      'background:#f5c451;color:#1b1b1b;font:12px/1.2 inherit;font-weight:600';
    next.onclick = (): void => { api.next(); };
    row.appendChild(skip);
    row.appendChild(next);
    bubble.appendChild(row);

    box.appendChild(bubble);
    layer.appendChild(box);
  };

  const api: TutorialHandle = {
    next(): void {
      if (finished) return;
      if (index >= TUTORIAL_STEPS.length - 1) { finish(); return; }
      index += 1;
      render();
    },
    skip(): void { finish(); },
    index(): number { return index; },
    destroy(): void {
      if (finished) return;
      finished = true;
      layer.remove();
    },
  };

  render();
  root.appendChild(layer);
  return api;
}