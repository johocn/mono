/**
 * Match3 纯逻辑引擎 — 三消核心规则（无渲染依赖）
 *
 * 功能：
 * - 根据 LevelConfig 生成棋盘（rows x cols），随机填充图标类型，保证开局无预消除且有解
 * - 支持相邻交换（点选 / 拖拽）
 * - 交换后检测横/竖 3+ 连线 → 消除 → 重力下落 → 顶部补充（级联结算）
 * - 计分：3消=50 / 4消=100 / 5+消=200；连击倍率（第2串=1.5x，第3串起=2x）
 * - 冰冻格障碍：不可移动/交换，相邻消除后解冻
 * - 步数计数：仅有效交换消耗 1 步
 * - 死局保护：结算后若无可解，自动重洗
 *
 * 动画支持（v2）：
 * `swap()` 返回 `SwapResolution`，内含每个级联步骤的**前后棋盘快照**、**被消除棋子及其颜色类型**、
 * **下落位移明细**。渲染层据此可以完整重建消除/下落动画，而引擎本身保持零渲染依赖。
 *
 * 设计原则：
 * - 不引用 DOM / Canvas / 任何 ui 模块，可独立单测
 * - 棋盘用 (string | null)[][] 表示，null = 空格
 */

import type { LevelConfig } from "../config/LevelConfig";

// === 公共类型 ===

/** 特效棋子种类（主流消消乐签名机制）：直线火箭 / 同色炸弹 / 包裹 / 鱼（2×2 生成，随机游动清子） */
export type SpecialKind = "lineH" | "lineV" | "colorBomb" | "wrap" | "fish";

/** 棋盘格子状态 */
export interface BoardCell {
  type: string | null;  // 图标类型，null = 空格
  frozen: boolean;      // 是否冰冻
  obstacle?: "frozen" | "chained" | "blackhole" | null;
  special?: SpecialKind | null;  // 特效棋子：4连→直线(行/列)，5连→同色炸弹
  jelly?: boolean;      // 果冻层：覆盖在棋子下方，该格消除即清除一层
}

/** 轻量格子快照（动画重建用） */
export interface CellSnapshot {
  type: string | null;
  frozen: boolean;
  obstacle?: "frozen" | "chained" | "blackhole" | null;
  special?: SpecialKind | null;
  jelly?: boolean;
}

/** 坐标 */
export interface MatchPosition {
  col: number;
  row: number;
}

/** 被消除的棋子（含类型，供粒子取色） */
export interface ClearedTile extends MatchPosition {
  type: string;
}

/** 一次下落位移 */
export interface DropMove {
  col: number;
  /** 起始行（可能为负 = 从棋盘上方补入） */
  fromRow: number;
  toRow: number;
  type: string;
  /** 是否为本轮新补充的棋子 */
  spawned: boolean;
}

/** 一个级联步骤（一轮消除 + 其后的下落补充） */
export interface CascadeStep {
  /** 0 = 首次消除，1+ = 连击 */
  index: number;
  multiplier: number;
  cleared: ClearedTile[];
  frozenCleared: MatchPosition[];
  jellyCleared?: MatchPosition[];  // 本段被清除的果冻层（仅果冻关有值）
  drops: DropMove[];
  scoreGained: number;
  /** 本轮消除前的棋盘 */
  before: CellSnapshot[][];
  /** 本轮下落补充完成后的棋盘 */
  after: CellSnapshot[][];
}

/** 一次交换的完整结算结果 */
export interface SwapResolution {
  valid: boolean;
  a: MatchPosition;
  b: MatchPosition;
  /** 交换完成、尚未消除的棋盘（无效交换回滚前的画面，供回弹动画） */
  afterSwap: CellSnapshot[][];
  /** 级联步骤（无效交换时为空数组） */
  steps: CascadeStep[];
  totalScore: number;
  /** 级联层数，>=2 表示触发连击 */
  comboCount: number;
  /** 结算后是否触发了死局重洗 */
  reshuffled: boolean;
  /** 是否触发了「特效交换组合」（两枚特效棋子交换） */
  specialCombo?: boolean;
  /** 最终棋盘 */
  finalBoard: CellSnapshot[][];
}

/** 提示：一个能产生消除的有效交换 */
export interface HintMove {
  a: MatchPosition;
  b: MatchPosition;
}

/** 锤子道具的结算结果（供渲染层做消除 + 下落动画） */
export interface HammerResolution {
  cleared: ClearedTile[];   // 被敲掉的格子（含类型，取色）
  drops: DropMove[];        // 下落位移明细
  after: CellSnapshot[][];  // 结算后棋盘快照
  reshuffled: boolean;      // 是否触发了死局重洗
}

/** 引擎状态快照（撤销道具用） */
export interface EngineSnapshot {
  grid: (string | null)[][];
  frozen: boolean[][];
  chained: boolean[][];
  blackhole: boolean[][];
  special: (SpecialKind | null)[][];
  jelly: boolean[][];
  score: number;
  stepsLeft: number;
  stepsUsed: number;
  maxCombo: number;
  totalCleared: number;
  collectCounts: Record<string, number>;
  shieldPending: boolean;
}

// === 内部类型 ===

interface MatchGroup {
  positions: MatchPosition[];
  length: number;
  direction: "row" | "col" | "square";  // square = 2×2 方块（生成鱼）
  type: string;
}

// === 常量 ===

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

/** 级联结算安全阀：单次交换的级联步数上限，超出即强制终止，防止极端棋盘下级联不收敛导致卡死/OOM。 */
const MAX_CASCADE_STEPS = 96;

const SCORE_LEN3 = 50;
const SCORE_LEN4 = 100;
const SCORE_LEN5 = 200;

// === 引擎 ===

export class Match3Engine {
  private level: LevelConfig | null = null;
  private cols: number = 0;
  private rows: number = 0;
  private iconTypes: string[] = [];
  private grid: (string | null)[][] = [];
  private frozen: boolean[][] = [];
  private score: number = 0;
  private stepsLeft: number = 0;
  private stepsUsed: number = 0;
  private maxCombo: number = 0;
  private totalCleared: number = 0;
  /** 收集目标：各待收集图标类型已累计消除数（仅记录关卡 goal.collect 涉及的类型） */
  private collectCounts: Record<string, number> = {};
  /** 护盾：抵消下一次步数消耗（由护盾道具激活） */
  private shieldPending: boolean = false;
  /** 锁链障碍：不可交换、打断连线，相邻消除后解锁（视觉区别于冰冻） */
  private chained: boolean[][] = [];
  /** 黑洞障碍：不可交换、打断连线，相邻消除后消散，渲染带脉冲（视觉区别于冰冻） */
  private blackhole: boolean[][] = [];
  /** 特效棋子：4连→直线火箭(lineH/lineV)，5连→同色炸弹(colorBomb) */
  private special: (SpecialKind | null)[][] = [];
  /** 果冻层：覆盖在普通棋子下方；该格被消除即清除一层，全部清除方可过关 */
  private jelly: boolean[][] = [];
  private jellyTotal: number = 0;
  /** 限时关：到达时间上限仍未达成目标即失败（取代步数约束） */
  private timed = false;
  private timeLeftMs = 0;
  private timeUp = false;
  /** 最近一次交换坐标（用于特效棋子生成位置优先落在交换点） */
  private lastSwap: { c1: number; r1: number; c2: number; r2: number } | null = null;

  // ---------- 初始化 ----------

  /**
   * 根据关卡配置初始化棋盘
   * - 生成 rows x cols 棋盘，随机填充图标，保证开局无预消除且至少存在一步可行解
   * - 布置冰冻障碍（若配置中有）
   */
  init(level: LevelConfig): void {
    this.level = level;
    this.cols = level.boardCols;
    this.rows = level.boardRows;
    this.iconTypes = (level.iconTypes ?? ["flower", "leaf", "fruit"]).slice();
    this.score = 0;
    this.stepsLeft = level.stepLimit;
    this.stepsUsed = 0;
    this.timed = !!level.timeLimit;
    this.timeLeftMs = (level.timeLimit ?? 0) * 1000;
    this.timeUp = false;
    this.maxCombo = 0;
    this.totalCleared = 0;
    this.collectCounts = {};
    this.shieldPending = false;

    this.initBoard();

    if (level.obstacles && level.obstacles.count > 0) {
      const { type, count } = level.obstacles;
      // 锁链 / 黑洞复用冰冻的「不可移动 + 相邻消除解锁」机制，仅视觉与命名不同
      if (type === "frozen") this.placeObstacles(this.frozen, count);
      else if (type === "chain") this.placeObstacles(this.chained, count);
      else if (type === "blackhole") this.placeObstacles(this.blackhole, count);
      // 障碍可能压死所有可行解，这里再兜底重洗一次
      this.ensurePlayable();
    }
    // 果冻层：覆盖在普通棋子下方，棋子可正常交换；在该格消除即清除一层
    if (level.obstacles?.type === "jelly" && (level.obstacles.count ?? 0) > 0) {
      this.placeJelly(level.obstacles.count);
      this.ensurePlayable();
    }
    this.lastSwap = null;
  }

  // ---------- 查询接口 ----------

  /** 返回棋盘状态副本（null = 空格） */
  getBoardState(): BoardCell[][] {
    const state: BoardCell[][] = [];
    for (let r = 0; r < this.rows; r++) {
      state[r] = [];
      for (let c = 0; c < this.cols; c++) {
        state[r][c] = { type: this.grid[r][c], frozen: this.frozen[r][c], obstacle: this.getObstacleAt(c, r), special: this.special[r][c], jelly: this.jelly[r][c] };
      }
    }
    return state;
  }

  /** 轻量快照（用于渲染层直接使用） */
  getBoardSnapshot(): CellSnapshot[][] {
    return this.snapshotBoard();
  }

  getStepsLeft(): number { return this.stepsLeft; }
  getStepsUsed(): number { return this.stepsUsed; }
  getScore(): number { return this.score; }
  getPassTarget(): number { return this.level?.passTarget ?? 0; }
  getStepLimit(): number { return this.level?.stepLimit ?? 0; }
  /** 补步道具：直接增加剩余步数 */
  addSteps(n: number): void { this.stepsLeft += n; }
  /** 护盾道具：激活一次步数消耗抵消 */
  grantShield(): void { this.shieldPending = true; }
  getCols(): number { return this.cols; }
  getRows(): number { return this.rows; }
  /** 本局最高连击层数 */
  getMaxCombo(): number { return this.maxCombo; }
  /** 本局累计消除棋子数 */
  getTotalCleared(): number { return this.totalCleared; }

  /** 胜利：有收集目标时判目标是否全部达成，否则判分数 ≥ 通关目标；果冻关还需清除全部果冻 */
  isWon(): boolean {
    const base = this.baseWin();
    const jellyOk = this.jellyTotal === 0 || this.getJellyRemaining() === 0;
    return base && jellyOk;
  }

  /** 收集 / 分数维度的「基础」胜利判定（不含果冻约束） */
  private baseWin(): boolean {
    if (this.level?.goal?.type === "collect") {
      const need = this.level.goal.collect;
      for (const k in need) {
        if ((this.collectCounts[k] ?? 0) < need[k]) return false;
      }
      return true;
    }
    return this.score >= (this.level?.passTarget ?? Infinity);
  }

  /** 剩余果冻层数（果冻关 HUD 展示用） */
  getJellyRemaining(): number {
    let n = 0;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) if (this.jelly[r][c]) n++;
    }
    return n;
  }

  /** 果冻层总数（= 初始布置数，用于 HUD 进度分母） */
  getJellyTotal(): number { return this.jellyTotal; }

  /** 收集目标的「已收集 / 目标」映射（无目标时返回空对象） */
  getCollectProgress(): Record<string, number> {
    return { ...this.collectCounts };
  }

  /** 收集目标的需收集数量映射（用于 HUD 药丸渲染） */
  getGoalTargets(): Record<string, number> {
    if (this.level?.goal?.type === "collect") return this.level.goal.collect;
    return {};
  }

  /** 仅记录关卡 goal.collect 涉及的类型的消除数（统计口径与 removeMatches 完全一致） */
  private recordCollect(cleared: ClearedTile[]): void {
    const need = this.level?.goal?.type === "collect" ? this.level.goal.collect : null;
    if (!need) return;
    for (const c of cleared) {
      if (Object.prototype.hasOwnProperty.call(need, c.type)) {
        this.collectCounts[c.type] = (this.collectCounts[c.type] ?? 0) + 1;
      }
    }
  }

  /** 失败：步数耗尽且未达标 */
  isLost(): boolean {
    if (this.timed) return this.timeUp && !this.isWon();
    return this.stepsLeft <= 0 && !this.isWon();
  }

  /** 是否限时关 */
  isTimed(): boolean { return this.timed; }
  /** 剩余时间（毫秒） */
  getTimeLeftMs(): number { return this.timeLeftMs; }
  /** 每帧推进计时（毫秒）；限时关到达 0 即标记 timeUp（由场景主循环驱动） */
  tick(dtMs: number): void {
    if (!this.timed || this.timeUp) return;
    this.timeLeftMs = Math.max(0, this.timeLeftMs - dtMs);
    if (this.timeLeftMs <= 0) this.timeUp = true;
  }

  /** 指定格是否冰冻 */
  isFrozen(col: number, row: number): boolean {
    if (!this.inBounds(col, row)) return false;
    return this.frozen[row][col];
  }

  /** 指定格是否为任意障碍（冰冻 / 锁链 / 黑洞） */
  getObstacleAt(col: number, row: number): "frozen" | "chained" | "blackhole" | null {
    if (!this.inBounds(col, row)) return null;
    if (this.frozen[row][col]) return "frozen";
    if (this.chained[row][col]) return "chained";
    if (this.blackhole[row][col]) return "blackhole";
    return null;
  }

  /** 内部：是否任意障碍格（打断连线 / 作为下落屏障 / 不可交换） */
  private isObstacleCell(r: number, c: number): boolean {
    return this.frozen[r][c] || this.chained[r][c] || this.blackhole[r][c];
  }

  /** 指定格是否为空格 */
  isEmpty(col: number, row: number): boolean {
    if (!this.inBounds(col, row)) return true;
    return this.grid[row][col] === null;
  }

  /** 查找一个能产生消除的交换（空闲提示用），无解返回 null */
  findHint(): HintMove | null {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.isObstacleCell(r, c) || this.grid[r][c] === null) continue;
        if (c + 1 < this.cols && !this.isObstacleCell(r, c + 1) && this.grid[r][c + 1] !== null) {
          if (this.swapCreatesMatch(c, r, c + 1, r)) {
            return { a: { col: c, row: r }, b: { col: c + 1, row: r } };
          }
        }
        if (r + 1 < this.rows && !this.isObstacleCell(r + 1, c) && this.grid[r + 1][c] !== null) {
          if (this.swapCreatesMatch(c, r, c, r + 1)) {
            return { a: { col: c, row: r }, b: { col: c, row: r + 1 } };
          }
        }
      }
    }
    return null;
  }

  /** 是否还存在可行交换 */
  hasMoves(): boolean {
    return this.findHint() !== null;
  }

  /**
   * 揭示道具：返回所有「交换后能消除」的格子坐标集合。
   * 与 findHint（仅一个）不同，这里枚举全盘所有可消除位置，用于「透视」式高亮。
   */
  findAllHintTiles(): MatchPosition[] {
    const out: MatchPosition[] = [];
    const seen = new Set<string>();
    const add = (col: number, row: number) => {
      const k = `${col},${row}`;
      if (!seen.has(k)) {
        seen.add(k);
        out.push({ col, row });
      }
    };
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.isObstacleCell(r, c) || this.grid[r][c] === null) continue;
        if (c + 1 < this.cols && !this.isObstacleCell(r, c + 1) && this.grid[r][c + 1] !== null
          && this.swapCreatesMatch(c, r, c + 1, r)) {
          add(c, r);
          add(c + 1, r);
        }
        if (r + 1 < this.rows && !this.isObstacleCell(r + 1, c) && this.grid[r + 1][c] !== null
          && this.swapCreatesMatch(c, r, c, r + 1)) {
          add(c, r);
          add(c, r + 1);
        }
      }
    }
    return out;
  }

  /**
   * 试探：两格交换后是否会产生消除（不改变棋盘，也不消耗步数）
   * 供提示系统 / 平衡模拟器批量枚举候选步使用
   */
  wouldMatch(col1: number, row1: number, col2: number, row2: number): boolean {
    if (!this.canSwap(col1, row1, col2, row2)) return false;
    return this.swapCreatesMatch(col1, row1, col2, row2);
  }

  /** 判断两格是否可作为一次交换的候选（不实际执行） */
  canSwap(col1: number, row1: number, col2: number, row2: number): boolean {
    if (!this.inBounds(col1, row1) || !this.inBounds(col2, row2)) return false;
    if (this.isObstacleCell(row1, col1) || this.isObstacleCell(row2, col2)) return false;
    if (Math.abs(col1 - col2) + Math.abs(row1 - row2) !== 1) return false;
    return this.grid[row1][col1] !== null && this.grid[row2][col2] !== null;
  }

  // ---------- 交换 ----------

  /**
   * 交换两枚相邻棋子并完整结算
   *
   * 返回的 SwapResolution 可以让渲染层重建以下动画：
   * 1. `afterSwap` + 交换点位移 → 滑动动画
   * 2. 若无效：用 `afterSwap` 反向插值 → 回弹动画
   * 3. 每个 `steps[i]`：`before` 是消除前的棋盘（被消除的棋子在 `cleared` 里），
   *    `after` 是下落补充后的棋盘，`drops` 给出每枚棋子的起止行 → 下落动画
   */
  swap(r1: number, c1: number, r2: number, c2: number): SwapResolution {
    const a: MatchPosition = { col: c1, row: r1 };
    const b: MatchPosition = { col: c2, row: r2 };

    if (!this.canSwap(c1, r1, c2, r2)) {
      return this.invalid(a, b);
    }

    const t1 = this.grid[r1][c1];
    const t2 = this.grid[r2][c2];

    // 执行交换（特效棋子随之移动，保持与颜色一致）
    const s1 = this.special[r1][c1];
    const s2 = this.special[r2][c2];
    this.grid[r1][c1] = t2;
    this.grid[r2][c2] = t1;
    this.special[r1][c1] = s2;
    this.special[r2][c2] = s1;
    this.lastSwap = { c1, r1, c2, r2 };
    const afterSwap = this.snapshotBoard();

    // 两枚均为特效棋子 → 触发「特效交换组合」（不依赖形成普通连线）
    const ka = this.special[r1][c1];
    const kb = this.special[r2][c2];
    if (ka && kb) {
      return this.specialSwap(r1, c1, r2, c2, ka, kb);
    }

    let current = this.detectMatches();
    if (current.length === 0) {
      // 无消除：回滚，不消耗步数
      this.grid[r1][c1] = t1;
      this.grid[r2][c2] = t2;
      return {
        valid: false,
        a, b,
        afterSwap,
        steps: [],
        totalScore: 0,
        comboCount: 0,
        reshuffled: false,
        finalBoard: this.snapshotBoard(),
      };
    }

    // 有效交换：消耗 1 步（护盾激活时抵消本次消耗）
    if (this.shieldPending) {
      this.shieldPending = false;
    } else {
      this.stepsLeft = Math.max(0, this.stepsLeft - 1);
      this.stepsUsed++;
    }

    const steps: CascadeStep[] = [];
    let totalScore = 0;
    let cascadeIndex = 0;

    while (current.length > 0) {
      if (cascadeIndex >= MAX_CASCADE_STEPS) break; // 安全阀：级联超阈值强制收敛，防止极端棋盘卡死/OOM
      const before = this.snapshotBoard();
      const { baseScore, cleared, frozenCleared, jellyCleared } = this.removeMatches(current);
      const multiplier = this.comboMultiplier(cascadeIndex);
      const gained = Math.round(baseScore * multiplier);
      this.score += gained;
      totalScore += gained;
      this.totalCleared += cleared.length;
      this.recordCollect(cleared);

      const drops = this.dropTiles();
      const after = this.snapshotBoard();

      steps.push({
        index: cascadeIndex,
        multiplier,
        cleared,
        frozenCleared,
        jellyCleared,
        drops,
        scoreGained: gained,
        before,
        after,
      });

      cascadeIndex++;
      current = this.detectMatches();
    }

    this.maxCombo = Math.max(this.maxCombo, cascadeIndex);

    // 死局保护：结算后若无任何可行解，自动重洗
    let reshuffled = false;
    if (this.findHint() === null) {
      this.reshuffleInternal();
      reshuffled = true;
    }

    return {
      valid: true,
      a, b,
      afterSwap,
      steps,
      totalScore,
      comboCount: cascadeIndex,
      reshuffled,
      finalBoard: this.snapshotBoard(),
    };
  }

  private invalid(a: MatchPosition, b: MatchPosition): SwapResolution {
    return {
      valid: false,
      a, b,
      afterSwap: this.snapshotBoard(),
      steps: [],
      totalScore: 0,
      comboCount: 0,
      reshuffled: false,
      finalBoard: this.snapshotBoard(),
    };
  }

  /**
   * 两枚特效棋子交换：触发「特效交换组合」大招（不依赖形成普通连线）。
   * 两格的特效一并引爆，并按组合类型扩大范围，随后自动级联结算。
   */
  private specialSwap(r1: number, c1: number, r2: number, c2: number, ka: SpecialKind, kb: SpecialKind): SwapResolution {
    const a: MatchPosition = { col: c1, row: r1 };
    const b: MatchPosition = { col: c2, row: r2 };

    // 消耗 1 步（护盾激活时抵消本次消耗）
    if (this.shieldPending) this.shieldPending = false;
    else { this.stepsLeft = Math.max(0, this.stepsLeft - 1); this.stepsUsed++; }

    const steps: CascadeStep[] = [];
    let totalScore = 0;
    let cascadeIndex = 0;
    const reserved = new Set<string>();

    const seed = this.comboSeed(r1, c1, r2, c2, ka, kb);
    seed.add(`${c1},${r1}`);
    seed.add(`${c2},${r2}`);

    const before = this.snapshotBoard();
    const { cleared, frozenCleared, jellyCleared } = this.applyClear(seed, reserved);
    const gained = Math.round(cleared.length * 30);
    this.score += gained;
    totalScore += gained;
    this.totalCleared += cleared.length;
    this.recordCollect(cleared);
    const drops = this.dropTiles();
    steps.push({ index: 0, multiplier: 1, cleared, frozenCleared, jellyCleared, drops, scoreGained: gained, before, after: this.snapshotBoard() });
    cascadeIndex++;

    // 组合后可能产生新的普通连线，自动级联
    let current = this.detectMatches();
    while (current.length > 0) {
      if (cascadeIndex >= MAX_CASCADE_STEPS) break; // 安全阀：级联超阈值强制收敛
      const b2 = this.snapshotBoard();
      const res = this.removeMatches(current);
      const mult = this.comboMultiplier(cascadeIndex);
      const g2 = Math.round(res.baseScore * mult);
      this.score += g2;
      totalScore += g2;
      this.totalCleared += res.cleared.length;
      this.recordCollect(res.cleared);
      const d2 = this.dropTiles();
      steps.push({ index: cascadeIndex, multiplier: mult, cleared: res.cleared, frozenCleared: res.frozenCleared, jellyCleared: res.jellyCleared, drops: d2, scoreGained: g2, before: b2, after: this.snapshotBoard() });
      cascadeIndex++;
      current = this.detectMatches();
    }
    this.maxCombo = Math.max(this.maxCombo, cascadeIndex);

    // 死局保护
    let reshuffled = false;
    if (this.findHint() === null) {
      this.reshuffleInternal();
      reshuffled = true;
    }

    return {
      valid: true,
      a, b,
      afterSwap: before,
      steps,
      totalScore,
      comboCount: cascadeIndex,
      reshuffled,
      specialCombo: true,
      finalBoard: this.snapshotBoard(),
    };
  }

  /** 两特效交换组合的爆炸范围 */
  private comboSeed(r1: number, c1: number, r2: number, c2: number, ka: SpecialKind, kb: SpecialKind): Set<string> {
    const set = new Set<string>();
    const hLine = (r: number) => {
      if (r < 0 || r >= this.rows) return;
      for (let cc = 0; cc < this.cols; cc++) set.add(`${cc},${r}`);
    };
    const vLine = (c: number) => {
      if (c < 0 || c >= this.cols) return;
      for (let rr = 0; rr < this.rows; rr++) set.add(`${c},${rr}`);
    };
    const block = (c: number, r: number, rad: number) => {
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          const nc = c + dc, nr = r + dr;
          if (this.inBounds(nc, nr)) set.add(`${nc},${nr}`);
        }
      }
    };
    const isRocket = (k: SpecialKind) => k === "lineH" || k === "lineV";
    if (isRocket(ka) && isRocket(kb)) {
      if (ka === "lineH" && kb === "lineH") { hLine(r1); hLine(r1 - 1); hLine(r1 + 1); }
      else if (ka === "lineV" && kb === "lineV") { vLine(c1); vLine(c1 - 1); vLine(c1 + 1); }
      else { hLine(r1); vLine(c1); } // 一横一竖 → 十字
    } else if (ka === "wrap" && kb === "wrap") {
      block(c1, r1, 2); // 5×5
    } else if ((ka === "wrap" && isRocket(kb)) || (kb === "wrap" && isRocket(ka))) {
      hLine(r1); vLine(c1); block(c1, r1, 1); // 十字 + 3×3
    } else if (ka === "colorBomb" || kb === "colorBomb") {
      // 同色炸弹 + 任意：清掉对方颜色的全场，并在两格各炸 3×3
      const other = ka === "colorBomb" ? this.grid[r2][c2] : this.grid[r1][c1];
      if (other) {
        for (let rr = 0; rr < this.rows; rr++) {
          for (let cc = 0; cc < this.cols; cc++) {
            if (this.grid[rr][cc] === other) set.add(`${cc},${rr}`);
          }
        }
      }
      block(c1, r1, 1);
      block(c2, r2, 1);
    } else {
      set.add(`${c1},${r1}`);
      set.add(`${c2},${r2}`);
      block(c1, r1, 1);
    }
    return set;
  }

  // ---------- 道具支持 ----------

  /**
   * 重洗棋盘（「重洗」道具 / 死局保护）
   * 冰冻格保持原位，其余棋子重新随机分布，保证无预消除且有解
   * @returns 重洗后的棋盘
   */
  reshuffle(): CellSnapshot[][] {
    this.reshuffleInternal();
    return this.snapshotBoard();
  }

  /**
   * 锤子道具：敲掉指定格（含其上的障碍，如冰冻/锁链/黑洞），触发一次重力与级联结算。
   * 不计步数（boosters 不消耗步数），仅计分并计入收集目标；返回供渲染层做动画的结果。
   */
  hammerRemove(col: number, row: number): HammerResolution | null {
    if (!this.inBounds(col, row)) return null;

    const cleared: ClearedTile[] = [];
    const t = this.grid[row][col];
    if (t !== null) {
      cleared.push({ col, row, type: t });
      this.grid[row][col] = null;
    }
    this.special[row][col] = null;
    // 锤子可敲碎该格的障碍（冰冻 / 锁链 / 黑洞）
    this.frozen[row][col] = false;
    this.chained[row][col] = false;
    this.blackhole[row][col] = false;
    this.jelly[row][col] = false;
    this.recordCollect(cleared);

    const drops = this.dropTiles();

    // 重力后可能产生新的连线，自动级联结算（不消耗步数，仅计分 + 计入收集）
    let current = this.detectMatches();
    let cascadeIndex = 0;
    while (current.length > 0) {
      if (cascadeIndex >= MAX_CASCADE_STEPS) break; // 安全阀：级联超阈值强制收敛
      const { baseScore, cleared: c } = this.removeMatches(current);
      const gained = Math.round(baseScore * this.comboMultiplier(cascadeIndex));
      this.score += gained;
      this.totalCleared += c.length;
      this.recordCollect(c);
      this.dropTiles();
      cascadeIndex++;
      current = this.detectMatches();
    }
    this.maxCombo = Math.max(this.maxCombo, cascadeIndex);

    // 死局保护
    let reshuffled = false;
    if (this.findHint() === null) {
      this.reshuffleInternal();
      reshuffled = true;
    }

    return { cleared, drops, after: this.snapshotBoard(), reshuffled };
  }

  /** 取当前完整状态（「撤销」道具用） */
  snapshot(): EngineSnapshot {
    return {
      grid: this.grid.map((row) => row.slice()),
      frozen: this.frozen.map((row) => row.slice()),
      chained: this.chained.map((row) => row.slice()),
      blackhole: this.blackhole.map((row) => row.slice()),
      special: this.special.map((row) => row.slice()),
      jelly: this.jelly.map((row) => row.slice()),
      score: this.score,
      stepsLeft: this.stepsLeft,
      stepsUsed: this.stepsUsed,
      maxCombo: this.maxCombo,
      totalCleared: this.totalCleared,
      collectCounts: { ...this.collectCounts },
      shieldPending: this.shieldPending,
    };
  }

  /** 恢复状态 */
  restore(s: EngineSnapshot): void {
    this.grid = s.grid.map((row) => row.slice());
    this.frozen = s.frozen.map((row) => row.slice());
    this.chained = s.chained.map((row) => row.slice());
    this.blackhole = s.blackhole.map((row) => row.slice());
    this.special = (s.special ?? this.grid.map((row) => row.map(() => null))).map((row) => row.slice());
    this.jelly = (s.jelly ?? this.grid.map((row) => row.map(() => false))).map((row) => row.slice());
    this.score = s.score;
    this.stepsLeft = s.stepsLeft;
    this.stepsUsed = s.stepsUsed;
    this.maxCombo = s.maxCombo;
    this.totalCleared = s.totalCleared;
    this.collectCounts = { ...(s.collectCounts ?? {}) };
    this.shieldPending = s.shieldPending;
  }

  // ---------- 内部：棋盘生成 ----------

  /** 初始化棋盘，保证开局无预消除 */
  private initBoard(): void {
    this.grid = [];
    this.frozen = [];
    this.chained = [];
    this.blackhole = [];
    this.special = [];
    for (let r = 0; r < this.rows; r++) {
      this.grid[r] = [];
      this.frozen[r] = [];
      this.chained[r] = [];
      this.blackhole[r] = [];
      this.special[r] = [];
      this.jelly[r] = [];
      for (let c = 0; c < this.cols; c++) {
        this.grid[r][c] = this.pickNoMatch(c, r);
        this.frozen[r][c] = false;
        this.chained[r][c] = false;
        this.blackhole[r][c] = false;
        this.special[r][c] = null;
        this.jelly[r][c] = false;
      }
    }
    this.ensurePlayable();
  }

  /** 反复重洗直到存在可行解（最多 60 次） */
  private ensurePlayable(): void {
    let tries = 0;
    while (this.findHint() === null && tries < 60) {
      this.reshuffleInternal();
      tries++;
    }
  }

  /** 选取一个不会与已放置邻居形成 3 连的类型 */
  private pickNoMatch(col: number, row: number): string {
    // Fisher-Yates：sort(() => Math.random() - 0.5) 是有偏洗牌，会让某些类型显著更常出现
    const shuffled = [...this.iconTypes];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    for (const t of shuffled) {
      if (col >= 2 && this.grid[row][col - 1] === t && this.grid[row][col - 2] === t) continue;
      if (row >= 2 && this.grid[row - 1][col] === t && this.grid[row - 2][col] === t) continue;
      if (this.makesSquare(col, row, t)) continue; // 避免形成 2×2 同色方块（与方块检测冲突）
      return t;
    }
    return shuffled[0];
  }

  /**
   * 检查在 (col,row) 放置类型 t 是否会与已放置邻居构成 2×2 同色方块。
   * 行优先填充下，每个 2×2 的「右下角」都是最后落子，故总能被其中一种取向捕获。
   */
  private makesSquare(col: number, row: number, t: string): boolean {
    const orientations: Array<Array<[number, number]>> = [
      [[col - 1, row], [col - 1, row - 1], [col, row - 1]],
      [[col + 1, row], [col + 1, row - 1], [col, row - 1]],
      [[col - 1, row], [col - 1, row + 1], [col, row + 1]],
      [[col + 1, row], [col + 1, row + 1], [col, row + 1]],
    ];
    for (const sq of orientations) {
      if (sq.every(([cc, rr]) => this.inBounds(cc, rr) && this.grid[rr] != null && this.grid[rr][cc] === t)) return true;
    }
    return false;
  }

  /** 随机布置障碍格到指定网格（避开已有障碍） */
  private placeObstacles(grid: boolean[][], count: number): void {
    const used = new Set<string>();
    let placed = 0;
    let tries = 0;
    const max = Math.min(count, Math.floor(this.cols * this.rows * 0.35));
    while (placed < max && tries < 400) {
      const c = Math.floor(Math.random() * this.cols);
      const r = Math.floor(Math.random() * this.rows);
      const key = `${c},${r}`;
      if (!used.has(key)) {
        used.add(key);
        grid[r][c] = true;
        placed++;
      }
      tries++;
    }
  }

  /** 布置果冻层（覆盖在普通棋子下方；棋子可正常移动/交换，在该格消除即清除一层） */
  private placeJelly(count: number): void {
    const used = new Set<string>();
    let placed = 0;
    let tries = 0;
    const max = Math.min(count, Math.floor(this.cols * this.rows * 0.6));
    while (placed < max && tries < 400) {
      tries++;
      const c = Math.floor(Math.random() * this.cols);
      const r = Math.floor(Math.random() * this.rows);
      const key = `${c},${r}`;
      if (used.has(key)) continue;
      if (this.isObstacleCell(r, c)) continue; // 障碍格不放果冻（否则无法清除 → 无法过关）
      used.add(key);
      this.jelly[r][c] = true;
      placed++;
    }
    this.jellyTotal = placed;
  }

  /**
   * 重洗所有「非冰冻」棋子，直到无预消除且有可行解（最多 40 次）
   * 冰冻格保持原位不动
   */
  private reshuffleInternal(): void {
    const types: string[] = [];
    const positions: MatchPosition[] = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.isObstacleCell(r, c)) continue;
        // 非障碍空格也纳入重洗范围：先补一个随机棋子，再随其它棋子一起打散，
        // 避免「重洗」把既有空洞永久保留（空洞会导致渲染破洞且无法被补充）。
        if (this.grid[r][c] === null) this.grid[r][c] = this.randomTile();
        types.push(this.grid[r][c] as string);
        positions.push({ col: c, row: r });
      }
    }
    if (positions.length === 0) return;

    // 保底：最后一轮直接重新随机生成，避免死循环
    for (let attempt = 0; attempt < 40; attempt++) {
      for (let i = types.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [types[i], types[j]] = [types[j], types[i]];
      }
      for (let i = 0; i < positions.length; i++) {
        const p = positions[i];
        this.grid[p.row][p.col] = types[i];
        this.special[p.row][p.col] = null;
      }
      if (this.detectMatches().length === 0 && this.findHint() !== null) return;
    }

    // 极端情况（例如冰块把棋盘切得太碎）：用「无 3 连 / 无 2×2」填充彻底重置，确保稳定
    for (const p of positions) {
      this.grid[p.row][p.col] = this.pickNoMatch(p.col, p.row);
      this.special[p.row][p.col] = null;
    }
  }

  // ---------- 内部：消除检测 ----------

  /** 检测所有 3+ 横/竖连线与 2×2 方块；冰冻格与空格会打断连线 */
  private detectMatches(): MatchGroup[] {
    const matches: MatchGroup[] = [];
    const lineCovered = new Set<string>();

    // 横向
    for (let r = 0; r < this.rows; r++) {
      let c = 0;
      while (c < this.cols) {
        const t = this.grid[r][c];
        if (t === null || this.isObstacleCell(r, c)) { c++; continue; }
        let end = c + 1;
        while (end < this.cols && !this.isObstacleCell(r, end) && this.grid[r][end] === t) end++;
        const len = end - c;
        if (len >= 3) {
          const positions: MatchPosition[] = [];
          for (let cc = c; cc < end; cc++) { positions.push({ col: cc, row: r }); lineCovered.add(`${cc},${r}`); }
          matches.push({ positions, length: len, direction: "row", type: t });
        }
        c = end;
      }
    }

    // 纵向
    for (let c = 0; c < this.cols; c++) {
      let r = 0;
      while (r < this.rows) {
        const t = this.grid[r][c];
        if (t === null || this.isObstacleCell(r, c)) { r++; continue; }
        let end = r + 1;
        while (end < this.rows && !this.isObstacleCell(end, c) && this.grid[end][c] === t) end++;
        const len = end - r;
        if (len >= 3) {
          const positions: MatchPosition[] = [];
          for (let rr = r; rr < end; rr++) { positions.push({ col: c, row: rr }); lineCovered.add(`${c},${rr}`); }
          matches.push({ positions, length: len, direction: "col", type: t });
        }
        r = end;
      }
    }

    // 2×2 方块：与线型消除独立，生成「鱼」特效棋；若方块与某条线型消除重叠，则交给线型/包裹处理
    for (let r = 0; r < this.rows - 1; r++) {
      for (let c = 0; c < this.cols - 1; c++) {
        const t = this.grid[r][c];
        if (t === null || this.isObstacleCell(r, c)) continue;
        if (this.grid[r][c + 1] !== t || this.isObstacleCell(r, c + 1)) continue;
        if (this.grid[r + 1][c] !== t || this.isObstacleCell(r + 1, c)) continue;
        if (this.grid[r + 1][c + 1] !== t || this.isObstacleCell(r + 1, c + 1)) continue;
        const corners = [
          { col: c, row: r }, { col: c + 1, row: r },
          { col: c, row: r + 1 }, { col: c + 1, row: r + 1 },
        ];
        if (corners.some((p) => lineCovered.has(`${p.col},${p.row}`))) continue;
        matches.push({ positions: corners, length: 4, direction: "square", type: t });
      }
    }

    return matches;
  }

  /**
   * 清除命中格、生成/激活特效棋子、解冻相邻障碍，计算本步得分（不含连击倍率）
   *
   * 特效棋子规则（对标主流消消乐，但仅两级、保持简单）：
   *  - 4 连（横）→ 生成「竖向火箭」(lineV，消除整列)；4 连（竖）→ 横向火箭 (lineH，消除整行)
   *  - 5+ 连（直线）→ 生成「同色炸弹」(colorBomb，消除全场同色)
   *  - 已被卷入消除的特效棋子会触发其效果，并可连锁触发其它特效
   */
  private removeMatches(matches: MatchGroup[]): {
    baseScore: number;
    cleared: ClearedTile[];
    frozenCleared: MatchPosition[];
    jellyCleared: MatchPosition[];
  } {
    const toClear = new Set<string>();
    for (const group of matches) {
      for (const p of group.positions) toClear.add(`${p.col},${p.row}`);
    }

    // L/T 形判定：同一格同时属于「横向 3 连」与「纵向 3 连」→ 交点生成包装炸弹 wrap（3×3）
    const cellInH = new Set<string>();
    const cellInV = new Set<string>();
    for (const g of matches) {
      if (g.length < 3) continue;
      if (g.direction === "row") for (const p of g.positions) cellInH.add(`${p.col},${p.row}`);
      else if (g.direction === "col") for (const p of g.positions) cellInV.add(`${p.col},${p.row}`);
      // direction === "square" 不参与线型包裹判定
    }

    // 生成特效棋子：线型长度 ≥4 → 直线火箭 / 同色炸弹；方块(2×2) → 鱼
    const creations: { col: number; row: number; kind: SpecialKind }[] = [];
    const createdKeys = new Set<string>();
    const reserved = new Set<string>(); // 本步保留为特效棋子的格（不参与消除）
    // 先落 wrap（L/T 交点优先，避免被直线生成抢占落点）
    for (const key of cellInH) {
      if (!cellInV.has(key)) continue;
      const [c, r] = key.split(",").map(Number);
      if (createdKeys.has(key)) continue;
      createdKeys.add(key);
      reserved.add(key);
      toClear.delete(key);
      creations.push({ col: c, row: r, kind: "wrap" });
    }
    // 再落直线 / 同色炸弹 / 鱼（方块）
    for (const group of matches) {
      if (group.length < 4) continue;
      let best = group.positions[Math.floor(group.positions.length / 2)];
      if (this.lastSwap) {
        let bestD = Infinity;
        for (const p of group.positions) {
          const d = Math.min(
            Math.abs(p.col - this.lastSwap.c1) + Math.abs(p.row - this.lastSwap.r1),
            Math.abs(p.col - this.lastSwap.c2) + Math.abs(p.row - this.lastSwap.r2),
          );
          if (d < bestD) { bestD = d; best = p; }
        }
      }
      const key = `${best.col},${best.row}`;
      if (createdKeys.has(key)) continue; // 与 wrap 共享落点，避免重复生成
      const kind: SpecialKind = group.direction === "square"
        ? "fish"
        : (group.length >= 5 ? "colorBomb" : (group.direction === "row" ? "lineV" : "lineH"));
      createdKeys.add(key);
      reserved.add(key);
      toClear.delete(key);
      creations.push({ col: best.col, row: best.row, kind });
    }

    // 激活特效 + 解锁障碍 + 清除果冻 + 清空
    const { cleared, frozenCleared, jellyCleared } = this.applyClear(toClear, reserved);

    // 计分：组内基础分 + 特效扩散额外消除 + 生成奖励
    let baseScore = 0;
    for (const group of matches) baseScore += this.baseScore(group.length);
    const groupCells = new Set<string>();
    for (const group of matches) for (const p of group.positions) groupCells.add(`${p.col},${p.row}`);
    let extraCells = 0;
    for (const key of toClear) if (!groupCells.has(key)) extraCells++;
    baseScore += extraCells * 15 + creations.length * 40;

    // 落定本步新生成的特效棋子（保留颜色，写入 special）
    for (const cr of creations) {
      this.special[cr.row][cr.col] = cr.kind;
    }

    return { baseScore, cleared, frozenCleared, jellyCleared };
  }

  /**
   * 公共清除：从种子集合出发，连锁激活其中所含的特效棋子，解锁 4 邻接障碍，
   * 记录并清空被消除棋子。reserved 中的格本步保留（不被消除），通常用于本步新生成的特效棋子。
   */
  private applyClear(seed: Set<string>, reserved: Set<string>): {
    cleared: ClearedTile[];
    frozenCleared: MatchPosition[];
    jellyCleared: MatchPosition[];
  } {
    const toClear = new Set<string>(seed);
    // 被特效直接扫到的障碍格：只破障、不清棋子（见下方循环内的说明）
    const unlockKeys = new Set<string>();
    const queue: string[] = [...toClear];
    while (queue.length > 0) {
      const key = queue.pop() as string;
      const [c, r] = key.split(",").map(Number);
      if (!this.inBounds(c, r)) continue;
      const kind = this.special[r][c];
      if (!kind) continue;
      for (const ek of this.specialEffectCells(c, r, kind)) {
        if (reserved.has(ek)) continue;
        const [ec, er] = ek.split(",").map(Number);
        // 障碍格（冰冻 / 锁链 / 黑洞）在重力阶段是「分隔点」，永远不会被补充新棋子。
        // 若把其中的棋子也清掉，该格就会留下永久空洞（渲染层表现为棋盘破洞）。
        // 因此特效扫到障碍时只解锁障碍、保留棋子——这与「鱼」特效刻意避开障碍格的处理一致。
        if (this.inBounds(ec, er) && this.isObstacleCell(er, ec)) {
          unlockKeys.add(ek);
          continue;
        }
        if (!toClear.has(ek)) { toClear.add(ek); queue.push(ek); }
      }
    }

    // 解锁：① 与任意待消除格 4 邻接的障碍格；② 被特效直接扫到的障碍格
    const frozenKeys = new Set<string>(unlockKeys);
    for (const key of toClear) {
      const [c, r] = key.split(",").map(Number);
      for (const [dc, dr] of DIRS) {
        const nc = c + dc;
        const nr = r + dr;
        if (this.inBounds(nc, nr) && this.isObstacleCell(nr, nc)) {
          frozenKeys.add(`${nc},${nr}`);
        }
      }
    }
    const frozenCleared: MatchPosition[] = [];
    for (const key of frozenKeys) {
      const [c, r] = key.split(",").map(Number);
      this.frozen[r][c] = false;
      this.chained[r][c] = false;
      this.blackhole[r][c] = false;
      frozenCleared.push({ col: c, row: r });
    }

    // 记录被消除棋子的类型（必须在清空前取），再清空；同时清除该格果冻层
    const cleared: ClearedTile[] = [];
    const jellyCleared: MatchPosition[] = [];
    for (const key of toClear) {
      if (reserved.has(key)) continue;
      const [c, r] = key.split(",").map(Number);
      if (this.jelly[r][c]) {
        this.jelly[r][c] = false;
        jellyCleared.push({ col: c, row: r });
      }
      cleared.push({ col: c, row: r, type: this.grid[r][c] as string });
      this.grid[r][c] = null;
      this.special[r][c] = null;
    }
    return { cleared, frozenCleared, jellyCleared };
  }

  /** 特效棋子作用范围（返回待加入消除集合的 key 列表） */
  private specialEffectCells(c: number, r: number, kind: SpecialKind): string[] {
    const out: string[] = [];
    if (kind === "lineH") {
      for (let cc = 0; cc < this.cols; cc++) out.push(`${cc},${r}`);
    } else if (kind === "lineV") {
      for (let rr = 0; rr < this.rows; rr++) out.push(`${c},${rr}`);
    } else if (kind === "wrap") { // 包装炸弹：3×3
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nc = c + dc, nr = r + dr;
          if (this.inBounds(nc, nr)) out.push(`${nc},${nr}`);
        }
      }
    } else if (kind === "colorBomb") { // 同色炸弹：消除全场同色（取该特效棋子自身颜色）
      const t = this.grid[r][c];
      if (t === null) return out;
      for (let rr = 0; rr < this.rows; rr++) {
        for (let cc = 0; cc < this.cols; cc++) {
          if (this.grid[rr][cc] === t) out.push(`${cc},${rr}`);
        }
      }
    } else if (kind === "fish") { // 鱼：清掉自身，并随机游动额外清掉 3 枚其他棋子（避开障碍格）
      out.push(`${c},${r}`);
      let added = 0, tries = 0;
      while (added < 3 && tries < 60) {
        tries++;
        const rr = Math.floor(Math.random() * this.rows);
        const cc = Math.floor(Math.random() * this.cols);
        if (rr === r && cc === c) continue;
        if (this.isObstacleCell(rr, cc)) continue;
        const key = `${cc},${rr}`;
        if (!out.includes(key)) { out.push(key); added++; }
      }
    }
    return out;
  }

  // ---------- 内部：下落与补充 ----------

  /**
   * 重力下落 + 顶部补充新棋子，并记录每枚棋子的位移明细
   * 冰冻格作为不可移动障碍，将所在列切分为多个独立段；每段内部棋子下沉到底
   */
  private dropTiles(): DropMove[] {
    const moves: DropMove[] = [];

    for (let c = 0; c < this.cols; c++) {
      const barriers: number[] = [];
      for (let r = 0; r < this.rows; r++) {
        if (this.isObstacleCell(r, c)) barriers.push(r);
      }
      barriers.push(this.rows);

      let topBound = -1;
      for (const barrier of barriers) {
        const segTop = topBound + 1;
        const segBottom = barrier - 1;
        if (segTop <= segBottom) {
          // 段内已有棋子（自顶向下），连同其特效棋子一并下沉
          const existing: { type: string; fromRow: number; special: SpecialKind | null }[] = [];
          for (let r = segTop; r <= segBottom; r++) {
            if (this.grid[r][c] !== null) {
              existing.push({ type: this.grid[r][c] as string, fromRow: r, special: this.special[r][c] });
            }
          }
          const fillCount = (segBottom - segTop + 1) - existing.length;

          // 新棋子从段顶之上依次补入（fromRow 为负偏移量）
          const list: { type: string; fromRow: number; spawned: boolean; special: SpecialKind | null }[] = [];
          for (let i = 0; i < fillCount; i++) {
            list.push({ type: this.randomTile(), fromRow: segTop - fillCount + i, spawned: true, special: null });
          }
          for (const e of existing) {
            list.push({ type: e.type, fromRow: e.fromRow, spawned: false, special: e.special });
          }

          let r = segTop;
          for (const item of list) {
            this.grid[r][c] = item.type;
            this.special[r][c] = item.special;
            moves.push({ col: c, fromRow: item.fromRow, toRow: r, type: item.type, spawned: item.spawned });
            r++;
          }
        }
        topBound = barrier;
      }
    }

    // 不变量兜底：极稀有边缘情形（如特效与障碍交互的极端棋盘）下，若某非障碍格
    // 仍为空，则补入随机棋子并记为新生成位移，确保棋盘永不出现永久空洞。
    for (let c = 0; c < this.cols; c++) {
      for (let r = 0; r < this.rows; r++) {
        if (this.grid[r][c] === null && !this.isObstacleCell(r, c)) {
          this.grid[r][c] = this.randomTile();
          moves.push({ col: c, fromRow: r - this.rows, toRow: r, type: this.grid[r][c] as string, spawned: true });
        }
      }
    }

    return moves;
  }

  private randomTile(): string {
    return this.iconTypes[Math.floor(Math.random() * this.iconTypes.length)];
  }

  // ---------- 内部：计分 ----------

  private baseScore(length: number): number {
    if (length <= 3) return SCORE_LEN3;
    if (length === 4) return SCORE_LEN4;
    return SCORE_LEN5;
  }

  /** 连击倍率：第 1 串 x1、第 2 串 x1.5、第 3 串起 x2 */
  private comboMultiplier(cascadeIndex: number): number {
    if (cascadeIndex <= 0) return 1;
    if (cascadeIndex === 1) return 1.5;
    return 2;
  }

  // ---------- 内部：工具 ----------

  /** 试探性交换并检测是否产生消除，完成后还原 */
  private swapCreatesMatch(col1: number, row1: number, col2: number, row2: number): boolean {
    const t1 = this.grid[row1][col1];
    const t2 = this.grid[row2][col2];
    this.grid[row1][col1] = t2;
    this.grid[row2][col2] = t1;
    const has = this.detectMatches().length > 0;
    this.grid[row1][col1] = t1;
    this.grid[row2][col2] = t2;
    return has;
  }

  private snapshotBoard(): CellSnapshot[][] {
    const snap: CellSnapshot[][] = [];
    for (let r = 0; r < this.rows; r++) {
      snap[r] = [];
      for (let c = 0; c < this.cols; c++) {
        snap[r][c] = { type: this.grid[r][c], frozen: this.frozen[r][c], obstacle: this.getObstacleAt(c, r), special: this.special[r][c], jelly: this.jelly[r][c] };
      }
    }
    return snap;
  }

  private inBounds(col: number, row: number): boolean {
    return col >= 0 && col < this.cols && row >= 0 && row < this.rows;
  }
}
