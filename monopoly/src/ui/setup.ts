/**
 * 开局面板（spec §6，版式 B）：全屏 DOM overlay，可见像素全在 DOM/CSS（与 ui/share.ts 同规），
 * 坐标/尺寸取值仍只取自 `src/skin/layout.ts`（`STAGE_W/STAGE_H/TUTORIAL_GAP`）以消除与渲染的漂移。
 * 纯 DOM 实现 → 可直接被 Vitest 的 jsdom 环境单测；席位归属与「是否弹面板」的判定全在此。
 */
import { PERSONAS, PERSONA_LABEL, DEFAULT_AI_ORDER, isPersona, type Persona, type Seat } from '../data/ai';
import { PLAYER_NAME, OWNER_HUE } from '../data/board';
import { STAGE_W, STAGE_H, TUTORIAL_GAP } from '../skin/layout';

export type SeatPlan = Seat[];              // 下标 = players 下标；总席位恒 4

const SETUP_KEY = 'mono.setup';
const TOTAL_SEATS = 4;
const CHOICES: number[] = [1, 2, 3, 4];

const FONT = '-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif';

/** `?humans=` → localStorage → null（需弹面板） */
export function resolveSeats(opts: { humans?: number; ai: Persona[] }): SeatPlan | null {
  if (opts.humans !== undefined) return planOf(opts.humans, opts.ai);
  return readPlan();
}

/** 真人数 + AI 性格序列 → 4 席位（余下按 `DEFAULT_AI_ORDER` 轮转补齐） */
export function planOf(humans: number, ai: Persona[]): SeatPlan {
  const n = Math.max(0, Math.min(TOTAL_SEATS, Math.floor(humans)));
  const out: SeatPlan = [];
  for (let i = 0; i < TOTAL_SEATS; i++) {
    out.push(i < n ? null : (ai[i - n] ?? DEFAULT_AI_ORDER[(i - n) % DEFAULT_AI_ORDER.length]));
  }
  return out;
}

/** localStorage 读回；未知/坏值/长度不符一律 null（不抛错） */
export function readPlan(): SeatPlan | null {
  try {
    const raw = localStorage.getItem(SETUP_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== TOTAL_SEATS) return null;
    return parsed.map((v) => (v === null ? null : typeof v === 'string' && isPersona(v) ? v : null));
  } catch {
    return null;
  }
}

export function writePlan(plan: SeatPlan): void {
  try { localStorage.setItem(SETUP_KEY, JSON.stringify(plan)); } catch { /* 隐私模式等：静默降级 */ }
}

/** 已选人数（真人席位个数）；`initial` 非法时回落 1 */
function humansOf(initial: SeatPlan | null): number {
  if (!initial) return 1;
  const n = initial.filter((s) => s === null).length;
  return n >= 1 && n <= TOTAL_SEATS ? n : 1;
}

/**
 * 弹出开局面板；resolve 时返回选定席位（选完即写 localStorage）。
 * `initial` 用于回填上次选择；「重看引导」回调由调用方给（tutorial 挂载点）。
 */
export function mountSetup(root: HTMLElement, initial: SeatPlan | null, onReplayTour: () => void): Promise<SeatPlan> {
  const overlay = document.createElement('div');
  overlay.id = 'mono-setup';
  overlay.style.cssText =
    'position:absolute;left:0;top:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;' +
    'background:rgba(4,8,6,.96);z-index:30;pointer-events:auto;overflow:auto;' +
    `font:13px/1.5 ${FONT};color:#d8e4dc`;

  const wrap = document.createElement('div');
  wrap.style.cssText = `position:relative;width:${STAGE_W}px;max-width:100%;min-height:${STAGE_H}px;padding:24px 16px;box-sizing:border-box`;
  overlay.appendChild(wrap);

  const title = document.createElement('h1');
  title.textContent = '大富翁 · 双阳';
  title.style.cssText = 'margin:8px 0 4px;font-size:20px;font-weight:700;color:#f5c451;text-align:center';
  wrap.appendChild(title);

  const sub = document.createElement('p');
  sub.textContent = '选好人数就能开局';
  sub.style.cssText = 'margin:0 0 18px;font-size:12px;color:#9fb3a9;text-align:center';
  wrap.appendChild(sub);

  const replay = document.createElement('button');
  replay.type = 'button';
  replay.dataset.action = 'setup:replay';
  replay.textContent = '重看引导';
  replay.style.cssText =
    'position:absolute;right:16px;top:24px;padding:6px 10px;border-radius:9px;cursor:pointer;' +
    'border:1px solid #3a4a42;background:rgba(6,12,10,.65);color:#9fb3a9;font:12px/1.2 inherit';
  replay.onclick = (): void => { onReplayTour(); };
  wrap.appendChild(replay);

  /* —— 真人玩家：2×2 大卡 —— */
  const rowLabel = (text: string): HTMLElement => {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = 'margin:14px 0 8px;font-size:12px;color:#9fb3a9';
    return el;
  };
  wrap.appendChild(rowLabel('真人玩家'));

  const grid = document.createElement('div');
  grid.dataset.action = 'setup:humans';
  grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px';
  wrap.appendChild(grid);

  /* —— AI 席位性格：一席位一行（色点 + 「N 号位 · 名字」）+ 保守 / 激进 / 投机 单选 chip —— */
  const aiLabel = rowLabel('AI 席位性格');
  wrap.appendChild(aiLabel);
  const aiRow = document.createElement('div');
  aiRow.dataset.action = 'setup:personas';
  aiRow.style.cssText = 'display:flex;flex-direction:column;gap:8px';
  wrap.appendChild(aiRow);

  /** 一席一行：行首色点 + 号位名，行内三枚性格 chip（单选高亮） */
  interface SeatRow { root: HTMLElement; dot: HTMLElement; name: HTMLElement; chips: HTMLButtonElement[] }
  const seatRows: SeatRow[] = [];
  for (let i = 0; i < TOTAL_SEATS - 1; i++) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px';

    const head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;gap:6px;flex:0 0 auto';
    const dot = document.createElement('span');
    dot.style.cssText = 'width:12px;height:12px;border-radius:50%;flex:0 0 auto';
    const name = document.createElement('span');
    name.style.cssText = 'font:12px/1.3 inherit;color:#d8e4dc;white-space:nowrap';
    head.appendChild(dot);
    head.appendChild(name);
    row.appendChild(head);

    const chipRow = document.createElement('div');
    chipRow.style.cssText = 'display:flex;gap:6px;flex:1';
    const chips: HTMLButtonElement[] = [];
    for (const p of PERSONAS) {
      const c = document.createElement('button');
      c.type = 'button';
      c.dataset.persona = p;
      c.textContent = PERSONA_LABEL[p];
      c.style.cssText = 'flex:1;padding:7px 0;border-radius:9px;cursor:pointer;font:12px/1.2 inherit';
      c.onclick = (): void => { aiPlan[i] = p; render(); };
      chipRow.appendChild(c);
      chips.push(c);
    }
    row.appendChild(chipRow);
    aiRow.appendChild(row);
    seatRows.push({ root: row, dot, name, chips });
  }

  /* 一键随机：给每个 AI 席位各随机一个性格并刷新界面 */
  const randomBtn = document.createElement('button');
  randomBtn.type = 'button';
  randomBtn.dataset.action = 'setup:random';
  randomBtn.textContent = '🎲 一键随机';
  randomBtn.style.cssText =
    'margin-top:8px;width:100%;padding:10px 12px;border-radius:11px;cursor:pointer;' +
    'border:1px solid #3a4a42;background:rgba(6,12,10,.65);color:#f5c451;font:13px/1.2 inherit;font-weight:600';
  randomBtn.onclick = (): void => {
    const nAi = TOTAL_SEATS - humans;
    const next: Persona[] = [];
    for (let i = 0; i < nAi; i++) next.push(PERSONAS[Math.floor(Math.random() * PERSONAS.length)]);
    aiPlan = next;
    render();
  };
  wrap.appendChild(randomBtn);

  const hint = document.createElement('p');
  hint.style.cssText = 'margin:14px 0 0;font-size:11px;line-height:1.6;color:#7f938a;text-align:center';
  wrap.appendChild(hint);

  let humans = humansOf(initial);
  /* AI 席位性格序列（长度随人数变化），初始值优先取上次选择 */
  const aiInit = initial ? initial.filter((s): s is Persona => s !== null) : [];
  let aiPlan: Persona[] = DEFAULT_AI_ORDER.slice(0, TOTAL_SEATS - humans);
  if (aiInit.length === TOTAL_SEATS - humans) aiPlan = aiInit.slice();

  const humanCards: HTMLButtonElement[] = CHOICES.map((n) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.humans = String(n);
    b.style.cssText = 'padding:16px 8px;border-radius:14px;cursor:pointer;font:15px/1.2 inherit;font-weight:600';
    b.onclick = (): void => { humans = n; render(); };
    grid.appendChild(b);
    return b;
  });

  const render = (): void => {
    for (const b of humanCards) {
      const on = Number(b.dataset.humans) === humans;
      b.textContent = `${b.dataset.humans} 人`;
      b.style.border = `1.5px solid ${on ? '#f5c451' : '#3a4a42'}`;
      b.style.background = on ? 'rgba(245,196,81,.14)' : 'rgba(6,12,10,.6)';
      b.style.color = on ? '#f5c451' : '#d8e4dc';
    }
    const nAi = TOTAL_SEATS - humans;
    /* 人数变化 → 席位序列随之重算（保留已有前缀，新席位按默认序补） */
    const next: Persona[] = [];
    for (let i = 0; i < nAi; i++) next.push(aiPlan[i] ?? DEFAULT_AI_ORDER[i % DEFAULT_AI_ORDER.length]);
    aiPlan = next;

    const showAi = nAi > 0;
    aiLabel.style.display = showAi ? '' : 'none';
    aiRow.style.display = showAi ? '' : 'none';
    randomBtn.style.display = showAi ? '' : 'none';
    /* 一席一行：行首「N 号位 · 名字」+ 代表色圆点；行内三枚 chip 单选高亮 */
    seatRows.forEach((sr, i) => {
      const show = i < nAi;
      sr.root.style.display = show ? '' : 'none';
      if (!show) return;
      const pid = humans + i + 1;                     // AI 席位对应的玩家号位（1..4）
      sr.dot.style.background = `hsl(${OWNER_HUE[pid]},62%,55%)`;
      sr.name.textContent = `${pid} 号位 · ${PLAYER_NAME[pid - 1]}`;
      const cur = aiPlan[i];
      for (const c of sr.chips) {
        const on = c.dataset.persona === cur;
        c.style.border = `1.5px solid ${on ? '#f5c451' : '#3a4a42'}`;
        c.style.background = on ? 'rgba(245,196,81,.16)' : 'rgba(6,12,10,.6)';
        c.style.color = on ? '#f5c451' : '#d8e4dc';
        c.style.fontWeight = on ? '700' : '400';
      }
    });
    hint.textContent = nAi > 0
      ? '进站即玩 · 剩余席位由 AI 接管'
      : '进站即玩 · 四人同屏轮流操作';
  };

  const start = document.createElement('button');
  start.type = 'button';
  start.dataset.action = 'setup:start';
  start.textContent = '开始游戏';
  start.style.cssText =
    `margin-top:${TUTORIAL_GAP}px;width:100%;padding:15px 12px;border:0;border-radius:12px;cursor:pointer;` +
    'background:#f5c451;color:#1b1b1b;font:15px/1.2 inherit;font-weight:700';
  wrap.appendChild(start);

  render();

  return new Promise<SeatPlan>((resolve) => {
    const pick = (): void => {
      const plan = planOf(humans, aiPlan);
      writePlan(plan);
      overlay.remove();
      resolve(plan);
    };
    start.onclick = pick;
    root.appendChild(overlay);
  });
}