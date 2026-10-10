/**
 * 成就系统 — 独立可扩展框架（对标主流「成就墙」）
 *
 * 设计要点：
 * - 成就定义集中在 ACHIEVEMENTS，纯数据 + 判定函数，新增成就只需追加一条。
 * - 原 ProgressStore 内联的「双阳纪念徽章」一次性奖励已迁移为首条成就，避免双写与重复发奖。
 * - evaluate() 在关键时机（结算后 / 签到后回到主菜单）调用：遍历未解锁成就，命中即发积分并入队庆祝。
 * - 庆祝队列由 ResultScene/主菜单顺序弹出（复用既有庆祝演出），与 ProgressStore 解耦（单向依赖 progress）。
 */

import { progress } from "./ProgressStore";
import { type ModeId } from "../config/LevelConfig";

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  rewardPoints: number;
  /** 仅在未解锁时评估，返回 true 表示达成 */
  condition: () => boolean;
}

export interface Celebration {
  id: string;
  name: string;
  desc: string;
  icon: string;
  rewardPoints: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "first_clear",
    name: "初露锋芒",
    desc: "首次通关任意一关",
    icon: "🌟",
    rewardPoints: 20,
    condition: () => progress.getCompletedCount() >= 1,
  },
  {
    id: "shuangyang_badge",
    name: "双阳纪念徽章",
    desc: "集齐全部双阳特色关卡",
    icon: "🏅",
    rewardPoints: 200,
    condition: () => progress.isShuangyangComplete(),
  },
  {
    id: "star_30",
    name: "星河初现",
    desc: "累计获得 30 颗星",
    icon: "✨",
    rewardPoints: 50,
    condition: () => progress.getTotalStars() >= 30,
  },
  {
    id: "all_modes",
    name: "三门齐通",
    desc: "三种模式各通关至少一关",
    icon: "🎯",
    rewardPoints: 60,
    condition: () => (["match3", "audio", "poetry", "corsi", "face", "memory", "stroop", "money", "pm", "clock", "nostalgia"] as ModeId[])
      .every((m) => progress.getModeStars(m).got > 0),
  },
  {
    id: "streak_3",
    name: "不缺席",
    desc: "连续签到满 3 天",
    icon: "📅",
    rewardPoints: 30,
    condition: () => progress.getSignStreak() >= 3,
  },
  {
    id: "streak_7",
    name: "七日之约",
    desc: "连续签到满 7 天",
    icon: "🗓",
    rewardPoints: 50,
    condition: () => progress.getSignStreak() >= 7,
  },
];

const STORAGE_KEY = "bg_achievements_v1";
const VERSION = 1;

class AchievementStore {
  private unlocked = new Set<string>();
  private pending: Celebration[] = [];

  load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { version?: number; unlocked?: string[] };
      if (!parsed || parsed.version !== VERSION) return;
      (parsed.unlocked ?? []).forEach((id) => this.unlocked.add(id));
    } catch {
      /* 数据损坏时忽略，视为无成就 */
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, unlocked: [...this.unlocked] }));
    } catch {
      /* 配额不足时静默忽略 */
    }
  }

  /** 评估所有未解锁成就；命中则发积分并入队庆祝（可一次解锁多个） */
  evaluate(): void {
    for (const a of ACHIEVEMENTS) {
      if (this.unlocked.has(a.id)) continue;
      if (a.condition()) {
        this.unlocked.add(a.id);
        this.save();
        if (a.rewardPoints > 0) progress.addPoints(a.rewardPoints, `earn_ach_${a.id}`);
        this.pending.push({
          id: a.id, name: a.name, desc: a.desc, icon: a.icon, rewardPoints: a.rewardPoints,
        });
      }
    }
  }

  /** 取出并移除队首庆祝（无则 null）；调用方负责依次弹出 */
  consumeCelebration(): Celebration | null {
    return this.pending.shift() ?? null;
  }

  isUnlocked(id: string): boolean {
    return this.unlocked.has(id);
  }

  getUnlockedCount(): number {
    return this.unlocked.size;
  }

  /** 成就列表（含解锁状态），供成就墙展示 */
  list(): { def: AchievementDef; unlocked: boolean }[] {
    return ACHIEVEMENTS.map((def) => ({ def, unlocked: this.unlocked.has(def.id) }));
  }
}

export const achievements = new AchievementStore();
