import type { Instance } from '../skin/instantiate';

export interface DebugPanel {
  mount(root: HTMLElement): void;
  show(inst: Instance | null): void;
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
  };
}