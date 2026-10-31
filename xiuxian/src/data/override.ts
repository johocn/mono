/**
 * 内容覆盖层（阶段3 内容编辑器的运行时骨架）：
 * 外部 public/data/override.json 合并进数据表（技能/怪物），无需重编译即可扩/调内容。
 * 编辑器产出的就是这份 JSON；运行时冷启动合并一次。缺失/解析失败静默回退空覆盖。
 */
export interface DataOverride {
  skills?: Record<string, any>;
  monsters?: Record<string, any>;
}

let cache: DataOverride = {};

export async function loadOverride(): Promise<DataOverride> {
  try {
    if (typeof fetch !== "function" || typeof window === "undefined") return {};
    const r = await fetch("data/override.json", { cache: "no-cache" });
    if (!r.ok) return {};
    cache = (await r.json()) as DataOverride;
  } catch {
    cache = {};
  }
  return cache;
}

export function getOverride(): DataOverride {
  return cache;
}
