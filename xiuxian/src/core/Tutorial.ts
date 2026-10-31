/**
 * 新手引导：标志位驱动的步骤机。仅在首跑（player.tutorialDone=false）时激活，
 * 由 Game 在对应事件点调用 notify(event) 推进；完成后回调置位 tutorialDone。
 * 无引擎依赖，可单测。
 */

export type TutEvent = "moved" | "talked" | "skilled" | "killed";

interface TutStep {
  /** 触发本步骤完成的事件 */
  on: TutEvent;
  /** 进入本步骤时展示的提示文案 */
  hint: string;
}

const STEPS: TutStep[] = [
  { on: "moved", hint: "点击地面移动，走近他人。" },
  { on: "talked", hint: "按 F 与村长对话，接受灵根测试。" },
  { on: "skilled", hint: "已习得技能，按 1-4 释放（超射程会自动接近）。" },
  { on: "killed", hint: "点击选中妖兽后施法击杀；B 背包 / K 技能 / T 天赋 / O 法宝。" },
];

export class Tutorial {
  private idx = 0;
  done = false;

  constructor(
    private readonly onHint: (text: string) => void,
    private readonly onComplete: () => void,
  ) {}

  /** 开始引导：展示首条提示 */
  start(): void {
    if (this.done) return;
    this.idx = 0;
    this.onHint(STEPS[0].hint);
  }

  /** 事件推进：当前步骤期待的事件到达则进入下一步 */
  notify(event: TutEvent): void {
    if (this.done) return;
    const step = STEPS[this.idx];
    if (!step || step.on !== event) return;
    this.idx++;
    if (this.idx >= STEPS.length) {
      this.done = true;
      this.onComplete();
    } else {
      this.onHint(STEPS[this.idx].hint);
    }
  }
}
