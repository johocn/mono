import type { Instance } from '../skin/instantiate';

export interface DebugPanel {
  mount(root: HTMLElement): void;
  show(inst: Instance | null): void;
  /** 版式切换行：`?show=0|b|c`（只改 query 后重载，避免两套视图堆在同一场景里） */
  mountViews(current: string, onPick: (v: string) => void): void;
}

export function createDebugPanel(): DebugPanel {
  let box: HTMLDivElement | null = null;
  return {
    mount(root) {
      box = document.createElement('div');
      box.id = 'mono-debug';
      box.style.cssText =
        'position:fixed;left:0;right:0;bottom:0;max-height:32vh;overflow:auto;' +
        'background:rgba(6,10,8,.92);color:#d8e4dc;font:11px/1.5 ui-monospace,monospace;' +
        'padding:6px 8px;z-index:9;white-space:pre-wrap';
      box.textContent = '[mono] debug on（点选元素显示 ID / 包围盒 / depth / provider 来源与回退级别）';
      root.appendChild(box);
    },
    show(inst) {
      if (!box) return;
      if (!inst) return;
      box.textContent = [
        inst.source,
        `box   w=${inst.box.w} d=${inst.box.d} h=${inst.box.h}`,
        `mount ${inst.mount}  lift=${inst.lift}`,
        `depth ${inst.depth}  slot=${inst.slot ?? 'null'}  skin=${inst.skin}`,
      ].join('\n');
    },
    mountViews(current, onPick) {
      const row = document.createElement('div');
      row.id = 'mono-views';
      row.style.cssText =
        'position:fixed;right:6px;bottom:34vh;z-index:10;display:flex;gap:4px;' +
        'font:11px/1.4 ui-monospace,monospace';
      for (const [value, label] of [['0', '棋盘'], ['b', '橱窗 B'], ['c', '对照 C']]) {
        const on = value === current;
        const b = document.createElement('button');
        b.textContent = label;
        b.style.cssText =
          'padding:3px 8px;border-radius:6px;cursor:pointer;border:1px solid #f5c451;' +
          `background:${on ? '#f5c451' : 'rgba(6,10,8,.9)'};color:${on ? '#1b1b1b' : '#f5c451'}`;
        b.onclick = () => onPick(value);
        row.appendChild(b);
      }
      document.body.appendChild(row);
    },
  };
}