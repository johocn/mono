/**
 * P3-7 多周目（NG+）：跨周目元进度（meta progression）。
 * 与单局存档（xiuxian.save.v1）相互独立：单局存档随新游戏覆盖，元进度持久累计，
 * 玩法上表现为「轮回」——每通关一次凝聚道痕、周目+1，新开局继承修为/灵石/历练效率加成。
 */
const KEY = "xiuxian.meta.v1";

export interface MetaSave {
  /** 已通关次数 = 当前可继承的周目数（第 N 周目由第 N-1 次通关解锁） */
  ngPlus: number;
  /** 道痕：通关累计的元货币（本 pass 仅累计展示，供后续兑换/玩法扩展） */
  daoHen: number;
  /** 历史通关次数（含本次） */
  clears: number;
}

export function loadMeta(): MetaSave {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const m = JSON.parse(raw);
      return {
        ngPlus: typeof m.ngPlus === "number" ? m.ngPlus : 0,
        daoHen: typeof m.daoHen === "number" ? m.daoHen : 0,
        clears: typeof m.clears === "number" ? m.clears : 0,
      };
    }
  } catch {
    /* 隐私模式 / 无 localStorage 时回退到零值 */
  }
  return { ngPlus: 0, daoHen: 0, clears: 0 };
}

export function saveMeta(m: MetaSave): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

/** 周目继承加成（纯函数，便于测试）：随周目线性增长，封顶避免失衡 */
export function carryover(ngPlus: number): { bonusExp: number; bonusStones: number; expMul: number } {
  const n = Math.max(0, ngPlus | 0);
  return {
    bonusExp: n * 300,
    bonusStones: n * 150,
    expMul: 1 + 0.1 * n,
  };
}

/** 通关时授予元进度（周目+1、道痕+50），返回新存档（不修改入参） */
export function grantClear(m: MetaSave): MetaSave {
  const clears = m.clears + 1;
  return { ngPlus: clears, daoHen: m.daoHen + 50, clears };
}
