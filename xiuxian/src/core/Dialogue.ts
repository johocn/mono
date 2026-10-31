/**
 * 对话树播放器：按 StoryNode 数据驱动推进。
 * 效果执行通过 host 回调外置，本类保持纯逻辑（可单测）。
 */
import type { StoryChoice, StoryCond, StoryEffect, StoryNode } from "../data/story/chapter1";

export interface DialogueHost {
  applyEffects(effects: StoryEffect[]): void;
  /** 选项显示条件判定（P3-7 选择分支）；返回 true 才显示该选项 */
  cond: (c: StoryCond) => boolean;
}

export class DialogueRunner {
  private nodes: Record<string, StoryNode>;
  private host: DialogueHost;
  private condFn: (c: StoryCond) => boolean;
  current: StoryNode | null = null;

  constructor(nodes: Record<string, StoryNode>, host: DialogueHost) {
    this.nodes = nodes;
    this.host = host;
    this.condFn = host.cond;
  }

  /** 当前节点中满足显示条件（cond）的可见选项（P3-7 选择分支） */
  get visibleChoices(): StoryChoice[] {
    const cs = this.current?.choices || [];
    return cs.filter((c) => !c.cond || this.condFn(c.cond));
  }

  get isOpen(): boolean {
    return this.current !== null;
  }

  /** 打开对话：触发根节点 effects */
  open(rootId: string): void {
    const node = this.nodes[rootId];
    if (!node) throw new Error(`dialogue node not found: ${rootId}`);
    this.current = node;
    if (node.effects) this.host.applyEffects(node.effects);
  }

  /** 推进对话：选择分支（无 choices 时 index 忽略）；to 为空串表示关闭 */
  advance(choiceIndex = 0): void {
    const node = this.current;
    if (!node) return;
    if (node.choices && node.choices.length > 0) {
      const visible = this.visibleChoices;
      const choice = visible[Math.max(0, Math.min(choiceIndex, visible.length - 1))];
      if (!choice) return; // 所有选项均被条件过滤：等待状态变化，避免死锁
      if (choice.effects) this.host.applyEffects(choice.effects);
      this.goto(choice.to);
      return;
    }
    if (node.next) this.goto(node.next);
    else this.close();
  }

  private goto(id: string): void {
    if (!id) {
      this.close();
      return;
    }
    const next = this.nodes[id];
    if (!next) throw new Error(`dialogue node not found: ${id}`);
    this.current = next;
    if (next.effects) this.host.applyEffects(next.effects);
  }

  close(): void {
    this.current = null;
  }
}
