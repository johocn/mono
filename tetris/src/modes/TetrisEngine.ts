/**
 * TetrisEngine — 俄罗斯方块内核（适老化）
 * 7 种方块、旋转、消行、升级、禅模式；道具作用于引擎：慢放/撤回/炸弹/变形/提示/护盾。
 * 引擎只负责逻辑与状态，渲染与输入由 TetrisScene 处理。
 */

import type { TetrisConfig } from "../config/LevelConfig";

type Matrix = number[][];

interface Piece {
  type: string;
  color: number; // 1..7
  matrix: Matrix;
  x: number;
  y: number;
}

interface Snapshot {
  board: number[][];
  score: number;
  lines: number;
  level: number;
}

export interface TetrisResult {
  score: number;
  lines: number;
  level: number;
  zen: boolean;
}

const SHAPES: { type: string; color: number; matrix: Matrix }[] = [
  { type: "I", color: 1, matrix: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]] },
  { type: "O", color: 2, matrix: [[1, 1], [1, 1]] },
  { type: "T", color: 3, matrix: [[0, 1, 0], [1, 1, 1], [0, 0, 0]] },
  { type: "S", color: 4, matrix: [[0, 1, 1], [1, 1, 0], [0, 0, 0]] },
  { type: "Z", color: 5, matrix: [[1, 1, 0], [0, 1, 1], [0, 0, 0]] },
  { type: "J", color: 6, matrix: [[1, 0, 0], [1, 1, 1], [0, 0, 0]] },
  { type: "L", color: 7, matrix: [[0, 0, 1], [1, 1, 1], [0, 0, 0]] },
];

const COLOR_SYMBOLS = ["", "I", "O", "T", "S", "Z", "J", "L"];

function rotateCW(m: Matrix): Matrix {
  const n = m.length;
  const r: Matrix = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      r[x][n - 1 - y] = m[y][x];
    }
  }
  return r;
}

function cloneBoard(b: number[][]): number[][] {
  return b.map((row) => row.slice());
}

export class TetrisEngine {
  readonly cols: number;
  readonly rows: number;
  private config: TetrisConfig;

  board: number[][] = [];
  current: Piece | null = null;
  next: Piece | null = null;
  score = 0;
  lines = 0;
  level = 1;
  gameOver = false;
  paused = false;
  zen = false;

  private gravityMs: number;
  private gravityAcc = 0;
  private startGravityMs: number;
  private minGravityMs: number;

  private undoStack: Snapshot[] = [];
  private slowUntil = 0;
  private hintUntil = 0;

  onGameOver: ((result: TetrisResult) => void) | null = null;

  constructor(config: TetrisConfig) {
    this.config = config;
    this.cols = config.boardCols;
    this.rows = config.boardRows;
    this.startGravityMs = config.startGravityMs;
    this.minGravityMs = config.minGravityMs;
    this.gravityMs = config.startGravityMs;
    this.resetBoard();
    this.next = this.randomPiece();
    this.spawn();
  }

  private resetBoard(): void {
    this.board = Array.from({ length: this.rows }, () => new Array(this.cols).fill(0));
  }

  private randomPiece(): Piece {
    const def = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    const matrix = def.matrix.map((r) => r.slice());
    const x = Math.floor((this.cols - matrix[0].length) / 2);
    return { type: def.type, color: def.color, matrix, x, y: 0 };
  }

  private spawn(): void {
    this.current = this.next ?? this.randomPiece();
    this.next = this.randomPiece();
    // 顶部留白：从 y=-1 进入，避免一出生就判定碰撞
    this.current.y = -this.topEmptyRows(this.current.matrix);
    if (this.collides(this.current, 0, 0)) {
      // 顶部堵死：禅模式清底续命；否则消耗护盾或结束
      if (this.zen) {
        this.clearBottomRows(4);
        this.current.y = -this.topEmptyRows(this.current.matrix);
      } else if (this.onShieldConsume?.()) {
        this.clearBottomRows(2);
        this.current.y = -this.topEmptyRows(this.current.matrix);
      } else {
        this.gameOver = true;
        this.onGameOver?.({ score: this.score, lines: this.lines, level: this.level, zen: this.zen });
      }
    }
  }

  /** 让场景提供护盾消耗钩子（避免引擎直接依赖背包） */
  onShieldConsume: (() => boolean) | null = null;

  private topEmptyRows(m: Matrix): number {
    let n = 0;
    for (const row of m) {
      if (row.every((v) => v === 0)) n++;
      else break;
    }
    return n;
  }

  private collides(p: Piece, dx: number, dy: number): boolean {
    const m = p.matrix;
    for (let y = 0; y < m.length; y++) {
      for (let x = 0; x < m[y].length; x++) {
        if (!m[y][x]) continue;
        const bx = p.x + x + dx;
        const by = p.y + y + dy;
        if (bx < 0 || bx >= this.cols || by >= this.rows) return true;
        if (by >= 0 && this.board[by][bx] !== 0) return true;
      }
    }
    return false;
  }

  private lock(): void {
    if (!this.current) return;
    // 撤销快照（仅记录最近 5 步）
    this.undoStack.push({
      board: cloneBoard(this.board),
      score: this.score,
      lines: this.lines,
      level: this.level,
    });
    if (this.undoStack.length > 5) this.undoStack.shift();

    const p = this.current;
    for (let y = 0; y < p.matrix.length; y++) {
      for (let x = 0; x < p.matrix[y].length; x++) {
        if (p.matrix[y][x]) {
          const by = p.y + y;
          const bx = p.x + x;
          if (by >= 0) this.board[by][bx] = p.color;
        }
      }
    }
    this.clearLines();
    this.spawn();
  }

  private clearLines(): void {
    let cleared = 0;
    for (let y = this.rows - 1; y >= 0; y--) {
      if (this.board[y].every((v) => v !== 0)) {
        this.board.splice(y, 1);
        this.board.unshift(new Array(this.cols).fill(0));
        cleared++;
        y++; // 重新检查同一行索引（已被上方下移的行填充）
      }
    }
    if (cleared > 0) {
      const table = [0, 100, 300, 500, 800];
      this.score += (table[cleared] ?? 800) * this.level;
      this.lines += cleared;
      const newLevel = 1 + Math.floor(this.lines / this.config.linesPerLevel);
      if (newLevel !== this.level) {
        this.level = newLevel;
        this.gravityMs = Math.max(this.minGravityMs, this.startGravityMs - (this.level - 1) * 90);
      }
    }
  }

  private clearBottomRows(n: number): void {
    for (let i = 0; i < n; i++) {
      this.board.shift();
      this.board.push(new Array(this.cols).fill(0));
    }
  }

  /** 计算当前方块落点（用于幽灵/提示） */
  private dropY(): number {
    if (!this.current) return 0;
    let dy = 0;
    while (!this.collides(this.current, 0, dy + 1)) dy++;
    return dy;
  }

  // === 输入 ===
  moveLeft(): boolean {
    if (!this.current || this.paused || this.gameOver) return false;
    if (!this.collides(this.current, -1, 0)) { this.current.x--; return true; }
    return false;
  }
  moveRight(): boolean {
    if (!this.current || this.paused || this.gameOver) return false;
    if (!this.collides(this.current, 1, 0)) { this.current.x++; return true; }
    return false;
  }
  softDrop(): void {
    if (!this.current || this.paused || this.gameOver) return;
    if (!this.collides(this.current, 0, 1)) { this.current.y++; this.score += 1; }
    else this.lock();
  }
  hardDrop(): void {
    if (!this.current || this.paused || this.gameOver) return;
    const dy = this.dropY();
    this.current.y += dy;
    this.score += dy * 2;
    this.lock();
  }
  rotate(): boolean {
    if (!this.current || this.paused || this.gameOver) return false;
    const rotated = rotateCW(this.current.matrix);
    const p = this.current;
    const kicks = [0, -1, 1, -2, 2];
    for (const kx of kicks) {
      if (!this.collides({ ...p, matrix: rotated }, kx, 0)) {
        p.matrix = rotated;
        p.x += kx;
        return true;
      }
    }
    return false;
  }

  // === 道具 ===
  useSlow(now: number): void {
    this.slowUntil = now + 20000;
  }
  isSlowed(now: number): boolean { return now < this.slowUntil; }

  useUndo(): boolean {
    const snap = this.undoStack.pop();
    if (!snap) return false;
    this.board = snap.board;
    this.score = snap.score;
    this.lines = snap.lines;
    this.level = snap.level;
    if (!this.current) this.spawn();
    return true;
  }

  useBomb(): void {
    // 清除最低的非空行（最多 2 行），缓解压力
    let removed = 0;
    for (let y = this.rows - 1; y >= 0 && removed < 2; y--) {
      if (this.board[y].some((v) => v !== 0)) {
        this.board.splice(y, 1);
        this.board.unshift(new Array(this.cols).fill(0));
        removed++;
        y++;
      }
    }
    this.score += 50;
  }

  useSwap(): void {
    if (!this.current || this.gameOver || this.paused) return;
    const def = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    const matrix = def.matrix.map((r) => r.slice());
    const x = Math.floor((this.cols - matrix[0].length) / 2);
    const candidate: Piece = { type: def.type, color: def.color, matrix, x, y: this.current.y };
    if (!this.collides(candidate, 0, 0)) {
      this.current = candidate;
    } else {
      this.current = { ...candidate, y: -this.topEmptyRows(matrix) };
    }
  }

  useHint(now: number): void { this.hintUntil = now + 6000; }
  isHinting(now: number): boolean { return now < this.hintUntil; }

  setZen(v: boolean): void { this.zen = v; }

  togglePause(): void { if (!this.gameOver) this.paused = !this.paused; }

  /** 每帧推进：dtMs 帧间隔，nowMs 当前时间（用于慢放/提示计时） */
  update(dtMs: number, nowMs: number): void {
    if (this.paused || this.gameOver || !this.current) return;
    const g = this.isSlowed(nowMs) ? this.gravityMs * 2 : this.gravityMs;
    this.gravityAcc += dtMs;
    while (this.gravityAcc >= g) {
      this.gravityAcc -= g;
      if (!this.collides(this.current, 0, 1)) {
        this.current.y++;
      } else {
        this.lock();
        if (this.gameOver) return;
      }
    }
  }

  /** 供渲染：当前方块的落点 y（幽灵行） */
  ghostY(): number { return this.current ? this.current.y + this.dropY() : 0; }
  /** 方块符号（色弱三重编码：形状符号） */
  static symbol(color: number): string { return COLOR_SYMBOLS[color] ?? ""; }
}
