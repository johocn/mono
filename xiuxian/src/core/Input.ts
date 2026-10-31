/**
 * 输入聚合：鼠标（点击移动/指向）+ 键盘（1-4 技能、B 背包、K 技能、F 对话、空格推进）。
 * 用法同引擎惯例：每帧 poll() → 查询 → lateUpdate() 计算按下边沿。
 */
export enum Key {
  ONE = 49, TWO = 50, THREE = 51, FOUR = 52,
  B = 66, K = 75, F = 70, N = 78, SPACE = 32, ESC = 27, M = 77,
  T = 84, O = 79, C = 67, A = 65, Q = 81, Z = 90, E = 69, P = 80, R = 82, L = 76, V = 86, SHIFT = 16,
  G = 71, Y = 89, X = 88,
}

/** 触屏设备探测（无 window 时返回 false，Node 冒烟安全） */
export function isTouchDevice(): boolean {
  try {
    return typeof window !== "undefined" && (("ontouchstart" in window) || ((navigator as any)?.maxTouchPoints || 0) > 0);
  } catch {
    return false;
  }
}

const PREVENT = new Set([Key.SPACE]);

/**
 * 客户端(CSS)坐标 → 舞台设计坐标。
 * 用 canvas 的 getBoundingClientRect 反推：矩形宽高比恒等于设计比（均匀缩放），
 * 故 offX/offY 在 SCALE_SHOWALL（居中留边）下为正、在 SCALE_NOBORDER（铺满裁切）下为 0，
 * 公式对两种模式都成立 —— 点击选目标 / NPC 对话 / 建造落点均准确。纯函数，便于 Node 冒烟单测。
 */
export function clientToStage(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  designW: number,
  designH: number,
): { x: number; y: number } {
  const scale = Math.min(rect.width / designW, rect.height / designH) || 1;
  const offX = (rect.width - designW * scale) / 2;
  const offY = (rect.height - designH * scale) / 2;
  return {
    x: (clientX - rect.left - offX) / scale,
    y: (clientY - rect.top - offY) / scale,
  };
}

export class Input {
  /** 上一次点击的画布坐标（ consumeClick 消费后置空） */
  private click: { x: number; y: number } | null = null;
  private keys = new Set<number>();
  private prev = new Set<number>();
  private canvasRect: { left: number; top: number; width: number; height: number } = { left: 0, top: 0, width: 0, height: 0 };

  /** 鼠标当前位置（画布坐标，供建造幽灵预览等使用） */
  mouseX = -1;
  mouseY = -1;
  /** 本帧右键是否按下（取消放置等） */
  private rightClicked = false;
  /** 滚轮增量累积（消费后清零，供相机缩放使用；负值=放大） */
  private wheelDelta = 0;

  // —— 移动端触控（虚拟摇杆 + 技能/交互按钮）——
  /** 虚拟摇杆向量（已归一化，范围 -1..1；未用时为 0） */
  joyX = 0;
  joyY = 0;
  joyActive = false;
  /** 本帧触控按下的技能槽（0-3，消费后置空） */
  private pendingSkill: number | null = null;
  /** 本帧触控交互（F）标志，消费后置空 */
  private pendingInteract = false;

  /** 附加输入：鼠标坐标以首个 canvas 的 boundingRect 换算 */
  attach(): void {
    if (typeof document === "undefined") return; // Node 冒烟环境
    const canvas = document.querySelector("canvas");
    // 每次事件都重取 rect：覆盖窗口缩放 / 页面滚动 / DPR 变化导致的画布位移与尺寸变化
    const rectOf = () => {
      const r: any = canvas?.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
      this.canvasRect = {
        left: r?.left || 0,
        top: r?.top || 0,
        width: r?.width || 0,
        height: r?.height || 0,
      };
    };
    /** 客户端坐标 → 舞台设计坐标（按 canvas 实际矩形反推，兼容 SHOWALL/NOBORDER） */
    const toStage = (clientX: number, clientY: number): { x: number; y: number } => {
      rectOf();
      const st: any = typeof globalThis !== "undefined" ? (globalThis as any).Laya?.stage : null;
      const dw = st?.designWidth || st?.width || 1280;
      const dh = st?.designHeight || st?.height || 720;
      return clientToStage(clientX, clientY, this.canvasRect, dw, dh);
    };
    rectOf();
    window.addEventListener("resize", rectOf);
    canvas?.addEventListener("mousedown", (e: any) => {
      const p = toStage(e.clientX, e.clientY);
      this.mouseX = p.x;
      this.mouseY = p.y;
      if (e.button === 2) {
        this.rightClicked = true;
        return;
      }
      this.click = { x: p.x, y: p.y };
    });
    canvas?.addEventListener("mousemove", (e: any) => {
      const p = toStage(e.clientX, e.clientY);
      this.mouseX = p.x;
      this.mouseY = p.y;
    });
    canvas?.addEventListener("contextmenu", (e: any) => e.preventDefault());
    canvas?.addEventListener("wheel", (e: any) => {
      this.wheelDelta += (e.deltaY || 0);
      e.preventDefault?.();
    }, { passive: false });
    // 抑制 iOS/移动端默认手势：双击缩放、橡皮筋滚动、双指缩放（passive:false 方能 preventDefault）
    canvas?.addEventListener("touchstart", (e: any) => {
      const t = e.changedTouches?.[0];
      if (t) {
        const p = toStage(t.clientX, t.clientY);
        this.mouseX = p.x;
        this.mouseY = p.y;
        this.click = { x: p.x, y: p.y };
      }
      e.preventDefault?.();
    }, { passive: false });
    canvas?.addEventListener("touchmove", (e: any) => e.preventDefault?.(), { passive: false });
    canvas?.addEventListener("gesturestart", (e: any) => e.preventDefault?.());
    window.addEventListener("keydown", (e: any) => {
      this.keys.add(e.keyCode);
      if (PREVENT.has(e.keyCode)) e.preventDefault();
    });
    window.addEventListener("keyup", (e: any) => {
      this.keys.delete(e.keyCode);
    });
  }

  /** 帧开始调用（预留手柄等） */
  poll(): void {}

  /** 帧末调用：快照按键，供下帧做按下边沿检测 */
  lateUpdate(): void {
    this.prev = new Set(this.keys);
    this.rightClicked = false;
  }

  /** 取走并清掉一次右键 */
  consumeRightClick(): boolean {
    const r = this.rightClicked;
    this.rightClicked = false;
    return r;
  }

  isDown(code: number): boolean {
    return this.keys.has(code);
  }

  /** 本帧是否刚按下（边沿） */
  wasPressed(code: number): boolean {
    return this.keys.has(code) && !this.prev.has(code);
  }

  /** 取走并清掉一次点击 */
  consumeClick(): { x: number; y: number } | null {
    const c = this.click;
    this.click = null;
    return c;
  }

  /** 取走并清掉累计滚轮增量（负值=向上滚/放大） */
  consumeWheel(): number {
    const w = this.wheelDelta;
    this.wheelDelta = 0;
    return w;
  }

  // —— 移动端触控状态设置（由 MobileControls 调用）——
  /** 设定摇杆向量（dx,dy 任意长度，内部归一化钳制） */
  setJoystick(dx: number, dy: number, active: boolean): void {
    const len = Math.hypot(dx, dy);
    if (!active || len < 1e-4) {
      this.joyX = 0; this.joyY = 0; this.joyActive = false;
      return;
    }
    const k = len > 1 ? 1 / len : 1;
    this.joyX = dx * k;
    this.joyY = dy * k;
    this.joyActive = true;
  }
  /** 触控按下某技能槽（0-3） */
  pressSkillSlot(i: number): void {
    this.pendingSkill = i;
  }
  /** 触控交互（F） */
  pressInteract(): void {
    this.pendingInteract = true;
  }
  /** 消费本帧触控技能按下次 */
  consumeSkillPress(): number | null {
    const s = this.pendingSkill;
    this.pendingSkill = null;
    return s;
  }
  /** 消费本帧触控交互 */
  consumeInteract(): boolean {
    const v = this.pendingInteract;
    this.pendingInteract = false;
    return v;
  }
  /** 触控自动战斗开关（由移动端按钮触发，Game 每帧消费） */
  private pendingAuto = false;
  pressAuto(): void {
    this.pendingAuto = true;
  }
  consumeAuto(): boolean {
    const v = this.pendingAuto;
    this.pendingAuto = false;
    return v;
  }

  /** 触控翻滚（由移动端按钮触发，Game 每帧消费） */
  private pendingRoll = false;
  pressRoll(): void {
    this.pendingRoll = true;
  }
  consumeRoll(): boolean {
    const v = this.pendingRoll;
    this.pendingRoll = false;
    return v;
  }

  /** 触控格挡（按住持续，移动端按钮按下/松开维护；Game 每帧读取） */
  blockHeld = false;
  pressBlock(): void { this.blockHeld = true; }
  releaseBlock(): void { this.blockHeld = false; }
}
