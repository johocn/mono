/**
 * 新手分步蒙层（spec §7）：DOM overlay，`z-index: 20`（低于开局面板 30、高于 hud 8 / panels 9）。
 * 仅蒙层与气泡吃事件；引导结束才放开游戏动作。不引入任何 `src/render/**` 依赖。
 *
 * v2（缺陷 1 修复）：
 * - 高亮框可见化：金色描边 + 外圈柔光 + 呼吸脉冲（脉冲包在 `prefers-reduced-motion` 内）+ 指向三角；
 * - 「跟手推进」：捕获阶段监听 document 点击，命中当前步的目标 `[data-action]` 才进下一步；
 * - 每步补一行「操作方式」（文案取自 `src/data/tutorial.ts`，本文件不写死中文）。
 */
import { TUTORIAL_STEPS } from '../data/tutorial';
import { STAGE_H, TUTORIAL_GAP } from '../skin/layout';
import type { Seat } from '../data/ai';

export type { Rect } from '../data/tutorial';

const TOUR_KEY = 'mono.tour.done';
const Z_TOUR = 20;
const GOLD = '#f5c451';
const FONT = '-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif';
/**
 * 高亮框：金色描边 + 外圈柔光 + 挖洞压暗（`9999px` 外阴影把框外盖暗）。
 * shadow 列表「先写的在上层」，故柔光在前、挖洞在后；呼吸脉冲只作用于 box-shadow，且仅在允许动效时启用。
 */
const HL_CSS =
  `#mono-tour .mono-tour-hl{position:absolute;border-radius:10px;border:2px solid ${GOLD};` +
  'box-shadow:0 0 20px 5px rgba(245,196,81,.55),0 0 0 4px rgba(245,196,81,.20),0 0 0 9999px rgba(4,8,6,.72);}' +
  '@media (prefers-reduced-motion: no-preference){' +
  '#mono-tour .mono-tour-hl{animation:mono-tour-pulse 1.6s ease-in-out infinite;}' +
  '@keyframes mono-tour-pulse{' +
  '0%,100%{box-shadow:0 0 12px 3px rgba(245,196,81,.40),0 0 0 3px rgba(245,196,81,.14),0 0 0 9999px rgba(4,8,6,.72);}' +
  '50%{box-shadow:0 0 28px 9px rgba(245,196,81,.90),0 0 0 8px rgba(245,196,81,.32),0 0 0 9999px rgba(4,8,6,.72);}' +
  '}}';

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
  /* 拆层后挂点改为 `#mono-ui`（spec §6 P0 第 8 项）：层填满整个 UI 根（inset:0），
     故 `TUTORIAL_STEPS` 里的 rect 仍是 390×844 舞台坐标，无需再换算。 */
  layer.style.cssText =
    'position:absolute;inset:0;' +
    `z-index:${Z_TOUR};pointer-events:none;font:13px/1.5 ${FONT};color:#d8e4dc`;

  /* 高亮样式（描边 / 柔光 / 脉冲）：随 layer 一起挂载与移除，避免遗留到 document */
  const styleEl = document.createElement('style');
  styleEl.textContent = HL_CSS;

  /* 「跟手推进」的捕获阶段点击监听；挂载后由下方赋值，finish / destroy 时解绑以免泄漏 */
  let detachDocs = (): void => { /* 挂载前为空实现 */ };

  const finish = (): void => {
    if (finished) return;
    finished = true;
    detachDocs();
    markDone();
    layer.remove();
    deps.onDone?.();
  };

  const render = (): void => {
    layer.textContent = '';
    layer.appendChild(styleEl);
    const step = TUTORIAL_STEPS[index];
    const box = document.createElement('div');
    box.dataset.tourStep = String(index);
    box.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%';

    /* 高亮框：金色描边 + 外圈柔光（样式见 HL_CSS），巨型外阴影把框外压暗 */
    let top = STAGE_H;
    for (const r of step.rects) {
      const hl = document.createElement('div');
      hl.className = 'mono-tour-hl';
      hl.style.cssText = `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`;
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
    /* 操作方式（缺陷 1 修复）：文案来自 data/tutorial.ts，此处只做排版 */
    const how = document.createElement('div');
    how.textContent = step.how;
    how.style.cssText =
      'margin-top:6px;font-size:12px;line-height:1.6;color:#d8e4dc;' +
      `border-left:2px solid ${GOLD};padding-left:8px`;
    bubble.appendChild(title);
    bubble.appendChild(text);
    bubble.appendChild(how);

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

    /* 指向目标的三角指示器：指最高高亮框（贴顶空间不足时翻到下方） */
    const first = step.rects[0];
    if (first) {
      const cx = first.x + first.w / 2;
      const tipAbove = first.y >= 14;
      const tri = document.createElement('div');
      tri.style.cssText =
        `position:absolute;left:${cx - 8}px;width:0;height:0;pointer-events:none;` +
        (tipAbove
          ? `top:${first.y - 10}px;border-left:8px solid transparent;border-right:8px solid transparent;border-top:10px solid ${GOLD}`
          : `top:${first.y + first.h}px;border-left:8px solid transparent;border-right:8px solid transparent;border-bottom:10px solid ${GOLD}`);
      box.appendChild(tri);
    }

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
      detachDocs();
      layer.remove();
    },
  };

  /* 捕获阶段判定：点到当前步的目标 `[data-action]` 即「跟手」进入下一步（气泡内按钮不在此列） */
  const onDocClick = (e: Event): void => {
    if (finished) return;
    const hit = (e.target as HTMLElement | null)?.closest?.('[data-action]') as HTMLElement | null;
    const action = hit?.dataset.action;
    if (!action) return;
    const step = TUTORIAL_STEPS[index];
    if (step !== undefined && step.actions.includes(action)) api.next();
  };
  document.addEventListener('click', onDocClick, true);
  detachDocs = (): void => { document.removeEventListener('click', onDocClick, true); };

  render();
  root.appendChild(layer);
  return api;
}