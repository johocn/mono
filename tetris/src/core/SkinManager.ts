/**
 * SkinManager — 典藏怀旧皮肤（本地优先，可后续接服务端同步）
 * 皮肤改变棋盘配色与背景，方块「形状 + 符号」三重编码在引擎内完成（色弱友好）。
 */

import { progress } from "./ProgressStore";
import { tetrisApi } from "./TetrisApi";

export interface SkinPalette {
  bg: string;
  panel: string;
  boardBg: string;
  grid: string;
  text: string;
  subText: string;
  accent: string;
  /** 7 种方块的填充色（I O T S Z J L） */
  blockColors: string[];
  /** 是否为浅色护眼主题（影响默认文字色） */
  light: boolean;
}

export interface SkinDef {
  id: string;
  name: string;
  emoji: string;
  blurb: string;
  pricePoints: number;
  palette: SkinPalette;
}

export const SKINS: SkinDef[] = [
  {
    id: "classic",
    name: "典藏深蓝",
    emoji: "🔷",
    blurb: "默认深海蓝主题，高对比清晰",
    pricePoints: 0,
    palette: {
      bg: "#16213e", panel: "#1b2a4a", boardBg: "#0e1830", grid: "rgba(120,140,210,0.18)",
      text: "#ffffff", subText: "#c3cadf", accent: "#4ECDC4", light: false,
      blockColors: ["#4ECDC4", "#FFE66D", "#FF6B6B", "#6BCB77", "#A66CFF", "#FF9F45", "#4FA8FF"],
    },
  },
  {
    id: "retro",
    name: "红白机像素",
    emoji: "🕹️",
    blurb: "经典 NES 怀旧配色，绿底方块",
    pricePoints: 30,
    palette: {
      bg: "#0b2a12", panel: "#10381c", boardBg: "#08200e", grid: "rgba(150,220,150,0.18)",
      text: "#eaffea", subText: "#b9e6c2", accent: "#FFE66D", light: false,
      blockColors: ["#FCFCFC", "#F83800", "#FCE000", "#00B800", "#7C7C00", "#0058F8", "#F878F8"],
    },
  },
  {
    id: "nostalgia",
    name: "怀旧绿",
    emoji: "🌿",
    blurb: "暖绿护眼主题，长时间游玩不刺眼",
    pricePoints: 30,
    palette: {
      bg: "#1f3d2b", panel: "#274d36", boardBg: "#16301f", grid: "rgba(180,230,180,0.16)",
      text: "#f3fff5", subText: "#cfe9d4", accent: "#FFD93D", light: false,
      blockColors: ["#7FD1AE", "#FFD93D", "#FF8C6B", "#8BD450", "#C792EA", "#FFB454", "#5BC0EB"],
    },
  },
  {
    id: "warm",
    name: "暖纸护眼",
    emoji: "📜",
    blurb: "浅色暖纸主题，夜间更柔和",
    pricePoints: 0,
    palette: {
      bg: "#F5F1E6", panel: "#FBF7EC", boardBg: "#EFE7D4", grid: "rgba(120,90,40,0.16)",
      text: "#2a241a", subText: "#6b5f48", accent: "#C8743A", light: true,
      blockColors: ["#2E86AB", "#E8A33D", "#C0392B", "#3F9142", "#8E44AD", "#D35400", "#16A085"],
    },
  },
];

const STORAGE_KEY = "tt_skin_v1";

class SkinManager {
  private currentId = "classic";
  private unlocked: Set<string> = new Set(["classic", "warm"]);

  load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const obj = JSON.parse(raw) as { current?: string; unlocked?: string[] };
        if (obj.current && SKINS.some((s) => s.id === obj.current)) this.currentId = obj.current;
        if (Array.isArray(obj.unlocked)) this.unlocked = new Set(obj.unlocked);
      }
    } catch { /* 忽略 */ }
    this.unlocked.add("classic");
  }

  restore(): void { this.load(); }

  getPalette(): SkinPalette {
    const def = SKINS.find((s) => s.id === this.currentId) ?? SKINS[0];
    return def.palette;
  }

  current(): SkinDef { return SKINS.find((s) => s.id === this.currentId) ?? SKINS[0]; }
  list(): SkinDef[] { return SKINS; }
  isUnlocked(id: string): boolean { return this.unlocked.has(id); }

  apply(id: string): boolean {
    if (!this.isUnlocked(id)) return false;
    this.currentId = id;
    this.persist();
    return true;
  }

  /** 购买并应用（用积分兑换）；在线走服务端权威，离线降级本地 */
  async purchase(id: string): Promise<boolean> {
    const def = SKINS.find((s) => s.id === id);
    if (!def || this.isUnlocked(id)) return false;
    if (tetrisApi.available()) {
      const r = await tetrisApi.unlockSkin(id);
      if (r.ok && r.data) {
        this.unlocked.add(id);
        this.currentId = id;
        this.persist();
        progress.setPoints(r.data.balance);
        return true;
      }
      // 服务端明确拒绝（如积分不足）不解锁；其它失败降级本地
      if (r.error && r.error.includes("不足")) return false;
    }
    if (!progress.spendPoints(def.pricePoints)) return false;
    this.unlocked.add(id);
    this.currentId = id;
    this.persist();
    return true;
  }

  /** 用服务端已解锁列表覆盖合并（登录同步时调用） */
  applyServerUnlocks(ids: string[]): void {
    for (const id of ids) if (SKINS.some((s) => s.id === id)) this.unlocked.add(id);
    this.persist();
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        current: this.currentId,
        unlocked: [...this.unlocked],
      }));
    } catch { /* 忽略 */ }
  }
}

export const skinManager = new SkinManager();
