/**
 * 首页 UI 皮肤（5 套可切换，默认「清新自然」）
 *
 * 与 config/themes.ts（关卡季节主题）相互独立：后者只作用于关内卡牌与 HUD 强调色，
 * 本文件作用于【首页/外壳】的整体配色（背景 / 标题 / 主按钮 / 标签 / 卡片 / 底导）。
 *
 * 设计约束：
 * - 浅色皮肤（fresh / candy / geometric）下，卡片底用半透明白，文字用深色，保证可读；
 * - 深色皮肤（neon / guofeng）沿用「深底亮字」适老化对比。
 * - 选中的底部导航统一白字 + 高亮胶囊 + accent 色条，避免「绿字配绿底」看不清。
 */

export type HomeStyleId = "fresh" | "candy" | "neon" | "guofeng" | "geometric";

export interface HomeStyle {
  id: HomeStyleId;
  label: string;
  /** 背景竖向渐变（上→中→下） */
  bgTop: string;
  bgMid: string;
  bgBottom: string;
  /** 强调色：标签选中、底导色条、每日礼等点缀 */
  accent: string;
  accentTop: string;     // accent 低透明（填充）
  accentBottom: string;
  accentStroke: string;
  /** 标题两行 */
  title: string;
  titleSub: string;
  /** 主按钮（继续训练）渐变 + 文字 */
  btnTop: string;
  btnBottom: string;
  btnText: string;
  /** 通用卡片（常用功能 / 玩法卡 / 二级按钮） */
  chipBg: string;
  chipText: string;
  chipStroke: string;
  /** 次级文字（星数 / 描述 / 标签 / 剩余时长） */
  muted: string;
  /** 星数文字 */
  starColor: string;
  /** 装饰光斑三色 */
  deco0: string;
  deco1: string;
  deco2: string;
  /** 底部导航条底色 */
  navBg: string;
}

export const DEFAULT_HOME_STYLE: HomeStyleId = "fresh";

export const HOME_STYLES: Record<HomeStyleId, HomeStyle> = {
  fresh: {
    id: "fresh", label: "清新自然",
    bgTop: "#eafaf1", bgMid: "#dff3ec", bgBottom: "#cdeede",
    accent: "#2e8b6b", accentTop: "rgba(46,139,107,0.22)", accentBottom: "rgba(46,139,107,0.18)", accentStroke: "rgba(46,139,107,0.55)",
    title: "#2e8b6b", titleSub: "#3f8f70",
    btnTop: "#2e8b6b", btnBottom: "#2fa89f", btnText: "#ffffff",
    chipBg: "rgba(255,255,255,0.72)", chipText: "#1f6b50", chipStroke: "rgba(46,139,107,0.35)",
    muted: "#4f8a72", starColor: "#e0a800",
    deco0: "rgba(255,128,180,0.18)", deco1: "rgba(46,139,107,0.16)", deco2: "rgba(224,168,0,0.12)",
    navBg: "rgba(26,112,86,0.96)",
  },
  candy: {
    id: "candy", label: "糖果梦幻",
    bgTop: "#ffe3f4", bgMid: "#ffd0ec", bgBottom: "#f3c4e6",
    accent: "#d6489f", accentTop: "rgba(214,72,159,0.22)", accentBottom: "rgba(214,72,159,0.18)", accentStroke: "rgba(214,72,159,0.55)",
    title: "#b83aa0", titleSub: "#c95fc0",
    btnTop: "#ffffff", btnBottom: "#ffd9f2", btnText: "#c4289a",
    chipBg: "rgba(255,255,255,0.72)", chipText: "#b83aa0", chipStroke: "rgba(214,72,159,0.35)",
    muted: "#a8559a", starColor: "#e0a800",
    deco0: "rgba(255,107,157,0.20)", deco1: "rgba(78,205,196,0.16)", deco2: "rgba(255,200,80,0.14)",
    navBg: "rgba(150,40,140,0.96)",
  },
  neon: {
    id: "neon", label: "暗夜霓虹",
    bgTop: "#1b1f4a", bgMid: "#141838", bgBottom: "#0a0c1f",
    accent: "#4be1ff", accentTop: "rgba(75,225,255,0.22)", accentBottom: "rgba(75,225,255,0.18)", accentStroke: "rgba(75,225,255,0.6)",
    title: "#7fd4ff", titleSub: "#b98bff",
    btnTop: "#4be1ff", btnBottom: "#c44bff", btnText: "#0a0c1f",
    chipBg: "rgba(255,255,255,0.07)", chipText: "#dfeaff", chipStroke: "rgba(120,200,255,0.3)",
    muted: "#8fb6e0", starColor: "#ffd24b",
    deco0: "rgba(255,107,157,0.13)", deco1: "rgba(75,225,255,0.18)", deco2: "rgba(255,210,75,0.12)",
    navBg: "rgba(14,18,46,0.97)",
  },
  guofeng: {
    id: "guofeng", label: "国风雅韵",
    bgTop: "#7a1f23", bgMid: "#5e1519", bgBottom: "#3f0e12",
    accent: "#f5c542", accentTop: "rgba(245,197,66,0.20)", accentBottom: "rgba(245,197,66,0.16)", accentStroke: "rgba(245,197,66,0.6)",
    title: "#f5c542", titleSub: "#e7b34a",
    btnTop: "#f5c542", btnBottom: "#e0972f", btnText: "#5e1519",
    chipBg: "rgba(245,197,66,0.10)", chipText: "#f3d77a", chipStroke: "rgba(245,197,66,0.35)",
    muted: "#d9a94a", starColor: "#ffd24b",
    deco0: "rgba(255,107,157,0.13)", deco1: "rgba(78,205,196,0.13)", deco2: "rgba(245,197,66,0.12)",
    navBg: "rgba(86,18,22,0.97)",
  },
  geometric: {
    id: "geometric", label: "活力几何",
    bgTop: "#fff7ec", bgMid: "#fdeedd", bgBottom: "#f3e6d6",
    accent: "#ff6b6b", accentTop: "rgba(255,107,107,0.22)", accentBottom: "rgba(255,107,107,0.18)", accentStroke: "rgba(255,107,107,0.55)",
    title: "#222222", titleSub: "#444444",
    btnTop: "#ff6b6b", btnBottom: "#e85a5a", btnText: "#ffffff",
    chipBg: "rgba(255,255,255,0.8)", chipText: "#222222", chipStroke: "rgba(34,34,34,0.2)",
    muted: "#6a6a6a", starColor: "#e0a800",
    deco0: "rgba(255,107,107,0.15)", deco1: "rgba(78,205,196,0.18)", deco2: "rgba(108,92,231,0.12)",
    navBg: "rgba(24,26,40,0.96)",
  },
};

/** 按持久化的 id 解析出完整皮肤（缺省回退默认） */
export function resolveHomeStyle(id?: HomeStyleId): HomeStyle {
  return HOME_STYLES[id ?? DEFAULT_HOME_STYLE] ?? HOME_STYLES[DEFAULT_HOME_STYLE];
}
