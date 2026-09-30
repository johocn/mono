/**
 * 游戏内风格控制台（spec §9）：**仅 `?debug=1` 挂载**，生产版零占用。
 *
 * 能力：逐栋选色（点棋盘任一格 → 5 套色卡）、按类批量（全部 L1/L2/L3 · 全部道具 · 全部环境层）、
 * 单素材 `params` 微调、导出完整 `theme.json`（复制回填 `public/config/theme.json`）。
 *
 * 铁律：改动**只存内存**（本模块的 `edits` 表），绝不写 `localStorage`——避免与 `?skin=` 语义互串；
 * 权威永远是 `theme.json`。导出 = 「原始 bindings + 每条改动转成的精确 id binding」（后写覆盖先写）。
 *
 * 本模块不含任何绘制逻辑：写回经 `deps.apply()`，由 `main.ts` 重算生效补丁并 `paint()` 实时预览。
 */
import { resolvePlacement, type PlacementOpts } from '../render/Scene';
import type { Geo } from '../render/iso';
import type { Instance } from '../skin/instantiate';
import { STAGE_H, STAGE_W } from '../skin/layout';
import type { Theme, ThemeBinding, ThemePatch } from '../skin/theme';

export interface ThemeConsoleDeps {
  /** 编译前的 `theme.json`（色卡与导出 JSON 的基准） */
  theme: Theme;
  /** 全部注册表元素 id（批量指派的作用域） */
  ids: string[];
  geo: Geo;
  placement: PlacementOpts;
  /** 当前场景实例（点选命中用；每帧重建，故取回调而非快照） */
  instances: () => Instance[];
  /** 读当前**生效**补丁（params 表单初值 = 实际生效值，避免「看到的和生效的不一样」） */
  patchOf: (id: string) => ThemePatch | undefined;
  /** 写回：`基准 ⊕ edits` 重算生效补丁并重画（实时预览） */
  apply: (edits: Record<string, ThemePatch>) => void;
}

export interface ThemeConsoleHandle {
  mount(root: HTMLElement): void;
  /** 给一组元素指派 palette：单个传 id、批量传正则（面板按钮与闸门共用同一入口） */
  setPalette(target: string | RegExp, paletteId: string): void;
  /** 单素材 `params` 覆盖（逐键压过 palette）——「单素材独立风格」的可视化入口 */
  setParams(id: string, params: Record<string, unknown>): void;
  /** 当前内存改动（只读快照） */
  edits(): Record<string, ThemePatch>;
  /** 完整 `theme.json`：原始 bindings + 每条改动（可直接回填 config/theme.json） */
  exportJson(): Theme;
  /** 丢弃全部内存改动，回到 `theme.json` 原样 */
  reset(): void;
}

/** 批量指派的作用域（spec §9）：「全部环境层」= `AtmosphereView` 的 `bg.*` 七件 */
const BATCHES: { label: string; re: RegExp }[] = [
  { label: '全部 L1', re: /^building\.[^.]+\.l1$/ },
  { label: '全部 L2', re: /^building\.[^.]+\.l2$/ },
  { label: '全部 L3', re: /^building\.[^.]+\.l3$/ },
  { label: '全部道具', re: /^prop\./ },
  { label: '全部环境层', re: /^bg\./ },
];

/** 可点选元素：与 `theme.json` 的 binding 域一致（UI / 特效 / 棋子的颜色走 skin tokens，不由本表管） */
const PICKABLE = /^(building|board|prop)\./;

/** 命中容差：菱形下沿外扩，点格子边缘也算命中该格 */
const PICK_PAD = 6;

export function createThemeConsole(deps: ThemeConsoleDeps): ThemeConsoleHandle {
  /** 内存改动表（唯一状态；`apply()` 时与基准补丁重算，故不会累积漂移） */
  const edits: Record<string, ThemePatch> = {};
  const paletteIds = Object.keys(deps.theme.palettes);
  let selected: string | null = null;
  /** 批量按钮使用的「当前色卡」：点色卡即更新，故批量永远跟随最近一次预览选择 */
  let picked: string | null = paletteIds[0] ?? null;

  let box: HTMLDivElement | null = null;
  let idInput: HTMLInputElement | null = null;
  let paramsArea: HTMLTextAreaElement | null = null;
  let exportArea: HTMLTextAreaElement | null = null;
  let batchHint: HTMLSpanElement | null = null;
  const swatches: HTMLButtonElement[] = [];

  const idsFor = (target: string | RegExp): string[] =>
    (typeof target === 'string' ? [target] : deps.ids.filter((id) => target.test(id)));

  const flush = (): void => { deps.apply({ ...edits }); };

  /** 面板刷新：选中 id / params 实际生效值 / 色卡高亮 / 批量提示（改动后与点选后各调一次） */
  const sync = (): void => {
    if (idInput) idInput.value = selected ?? '';
    if (paramsArea) {
      const p = selected ? deps.patchOf(selected)?.params ?? {} : {};
      paramsArea.value = JSON.stringify(p, null, 1);
    }
    for (const [i, b] of swatches.entries()) {
      const on = paletteIds[i] === picked;
      b.style.outline = on ? '2px solid #f5c451' : 'none';
    }
    if (batchHint) batchHint.textContent = picked ?? '（无）';
  };

  const setPalette: ThemeConsoleHandle['setPalette'] = (target, paletteId) => {
    const pal = deps.theme.palettes[paletteId];
    if (!pal || Object.keys(pal).length === 0) return;
    for (const id of idsFor(target)) {
      const prev = edits[id];
      /* palette 展开成 params（与 compileTheme 同口径）⇒ 导出即「钉住的逐元素补丁」 */
      edits[id] = { preset: prev?.preset, params: { ...(prev?.params ?? {}), ...pal } };
    }
    picked = paletteId;
    if (typeof target === 'string') selected = target;
    flush();
    sync();
  };

  const setParams: ThemeConsoleHandle['setParams'] = (id, params) => {
    const prev = edits[id];
    edits[id] = { preset: prev?.preset, params: { ...(prev?.params ?? {}), ...params } };
    selected = id;
    flush();
    sync();
  };

  /** 屏幕坐标 → 元素 id：按台位命中矩形拾取（近处优先、同格取体量大者），非网格元素（`bg.*`）走 id 输入框 */
  const pickAt = (x: number, y: number): string | null => {
    const hits: { id: string; near: number; tall: number }[] = [];
    for (const inst of deps.instances()) {
      if (!PICKABLE.test(inst.id)) continue;
      const p = resolvePlacement(
        { id: inst.id, c: inst.c, r: inst.r, slot: inst.slot, lift: inst.lift, box: inst.box, mount: inst.mount, scale: inst.scale },
        deps.geo,
        deps.placement,
      );
      const hw = (inst.box.w / 2) * p.s;
      const hh = (inst.box.d / 2) * p.s;
      if (x < p.cx - hw || x > p.cx + hw) continue;
      if (y < p.cy - hh - inst.box.h * p.s || y > p.cy + hh + PICK_PAD) continue;
      hits.push({ id: inst.id, near: inst.c + inst.r, tall: inst.box.h });
    }
    if (hits.length === 0) return null;
    hits.sort((a, b) => b.near - a.near || b.tall - a.tall);
    return hits[0].id;
  };

  const onCanvasDown = (ev: MouseEvent): void => {
    const canvas = document.getElementById('stage');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = (ev.clientX - rect.left) * (STAGE_W / rect.width);
    const y = (ev.clientY - rect.top) * (STAGE_H / rect.height);
    const id = pickAt(x, y);
    if (!id) return;
    selected = id;
    sync();
  };

  /** 完整 `theme.json`：原始 bindings + 每条改动（后写覆盖先写，故新增条目必定生效） */
  const exportJson = (): Theme => ({
    palettes: deps.theme.palettes,
    bindings: [
      ...deps.theme.bindings,
      ...Object.entries(edits).map(([id, p]): ThemeBinding => ({
        match: id,
        ...(p.preset ? { preset: p.preset } : {}),
        params: { ...p.params },
      })),
    ],
  });

  const reset = (): void => {
    for (const id of Object.keys(edits)) delete edits[id];
    flush();
    sync();
  };

  const line = (text: string, css = ''): HTMLDivElement => {
    const d = document.createElement('div');
    d.style.cssText = css;
    d.textContent = text;
    return d;
  };

  const row = (): HTMLDivElement => {
    const d = document.createElement('div');
    d.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;margin-top:4px';
    return d;
  };

  const smallBtn = (label: string): HTMLButtonElement => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText =
      'padding:2px 6px;border-radius:5px;cursor:pointer;font:inherit;' +
      'border:1px solid #f5c451;background:rgba(245,196,81,.12);color:#f5c451';
    return b;
  };

  return {
    mount(root) {
      box = document.createElement('div');
      box.id = 'mono-theme-console';
      box.style.cssText =
        'position:fixed;left:6px;top:6px;width:198px;max-height:54vh;overflow:auto;z-index:11;' +
        'background:rgba(6,10,8,.92);color:#d8e4dc;font:11px/1.5 ui-monospace,monospace;' +
        'padding:6px 8px;border-radius:8px;border:1px solid rgba(245,196,81,.45)';
      box.appendChild(line('风格控制台 · 仅 ?debug=1（改动只存内存）', 'color:#f5c451'));

      if (paletteIds.length === 0) {
        box.appendChild(line('theme.json 未加载：色卡不可用（导出仍可用）', 'color:#e08b7a'));
      }

      /* 选中元素：点棋盘任一格即填入；也可手输 id 选非网格元素（如 bg.streetLamp / prop.signTower） */
      const idRow = row();
      idRow.appendChild(line('选中'));
      idInput = document.createElement('input');
      idInput.style.cssText = 'flex:1;min-width:0;font:inherit;background:#101a16;color:#d8e4dc;border:1px solid #3a4a42;border-radius:4px;padding:1px 3px';
      idInput.placeholder = '点棋盘 / 输 id';
      idInput.addEventListener('change', () => { selected = idInput?.value.trim() || null; sync(); });
      idRow.appendChild(idInput);
      box.appendChild(idRow);

      /* 5 套 palette 色卡：点一枚即给选中元素套色并实时预览（spec §9「逐栋选色」） */
      const palRow = row();
      for (const id of paletteIds) {
        const pal = deps.theme.palettes[id] ?? {};
        const b = smallBtn(id);
        b.style.background = pal.wallL ?? '#101a16';
        b.style.color = '#1b1b1b';
        b.style.borderColor = pal.roof ?? '#f5c451';
        b.title = Object.entries(pal).map(([k, v]) => `${k} ${v}`).join('\n');
        b.onclick = () => { if (selected) setPalette(selected, id); else { picked = id; sync(); } };
        swatches.push(b);
        palRow.appendChild(b);
      }
      box.appendChild(palRow);

      /* 按类批量（spec §9）：作用域见 BATCHES，色卡用最近一次预览选择 */
      const bRow = row();
      const head = line('批量 → ');
      batchHint = document.createElement('span');
      batchHint.style.color = '#f5c451';
      head.appendChild(batchHint);
      bRow.appendChild(head);
      box.appendChild(bRow);
      const cRow = row();
      for (const { label, re } of BATCHES) {
        const b = smallBtn(label);
        b.onclick = () => { if (picked) setPalette(re, picked); };
        cRow.appendChild(b);
      }
      box.appendChild(cRow);

      /* 单素材微调：选中元素的 params（已含 palette 展开值），改哪个键就覆盖哪个键 */
      box.appendChild(line('params（选中元素）', 'margin-top:6px;color:#9fb3a8'));
      paramsArea = document.createElement('textarea');
      paramsArea.style.cssText = 'width:100%;height:74px;box-sizing:border-box;font:inherit;background:#101a16;color:#d8e4dc;border:1px solid #3a4a42;border-radius:4px';
      box.appendChild(paramsArea);
      const pRow = row();
      const applyBtn = smallBtn('应用 params');
      applyBtn.onclick = () => {
        if (!selected || !paramsArea) return;
        try {
          const parsed: unknown = JSON.parse(paramsArea.value);
          if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('需要对象');
          setParams(selected, parsed as Record<string, unknown>);
        } catch (e) {
          box?.appendChild(line(`params 不是合法对象 JSON：${String(e)}`, 'color:#e08b7a'));
        }
      };
      pRow.appendChild(applyBtn);
      const dropBtn = smallBtn('清空该元素改动');
      dropBtn.onclick = () => {
        if (selected) delete edits[selected];
        flush();
        sync();
      };
      pRow.appendChild(dropBtn);
      box.appendChild(pRow);

      /* 导出：原始 bindings + 每条改动（后写覆盖先写）⇒ 可直接回填 public/config/theme.json */
      const eRow = row();
      const expBtn = smallBtn('导出 theme.json');
      expBtn.onclick = () => {
        const json = JSON.stringify(exportJson(), null, 2);
        if (exportArea) exportArea.value = json;
        console.log('[mono] theme.json', json);
      };
      eRow.appendChild(expBtn);
      const resetBtn = smallBtn('还原全部改动');
      resetBtn.onclick = () => { reset(); };
      eRow.appendChild(resetBtn);
      box.appendChild(eRow);
      exportArea = document.createElement('textarea');
      exportArea.readOnly = true;
      exportArea.style.cssText = 'width:100%;height:54px;box-sizing:border-box;font:inherit;background:#101a16;color:#9fe;border:1px solid #3a4a42;border-radius:4px';
      box.appendChild(exportArea);

      root.appendChild(box);
      document.getElementById('stage')?.addEventListener('pointerdown', onCanvasDown as EventListener);
      sync();
    },

    setPalette,
    setParams,
    exportJson,
    reset,
    edits() { return { ...edits }; },
  };
}
