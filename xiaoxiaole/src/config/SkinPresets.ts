/**
 * 官方皮肤预设 — 人民币出售的成品皮肤
 *
 * 这些皮肤随版本内置（无需下载素材），人民币购买后直接解锁并应用。
 * 配色均满足适老化对比度（棋子 vs 棋盘底色 ≥ 4.5:1），可放心作为商品。
 */

import type { SkinConfig } from "../core/Skin";

export const OFFICIAL_SKINS: SkinConfig[] = [
  {
    id: "official_dawn",
    name: "晨曦花园",
    author: "脑力花园",
    createdAt: 0,
    version: 1,
    bg: {
      colors: ["#2b1b3d", "#4a2c5a", "#f0a35e"],
      stops: [0, 0.62, 1],
      glows: [
        { color: "rgba(255,214,102,0.16)", cx: 0.22, cy: 0.18, r: 0.55 },
        { color: "rgba(255,159,67,0.12)", cx: 0.82, cy: 0.86, r: 0.6 },
      ],
    },
    board: {
      base: "rgba(38,24,52,0.86)",
      glow: "rgba(255,209,102,0.3)",
      stroke: "rgba(255,214,102,0.4)",
    },
    tiles: {
      flower: { color: "#FFD166", label: "花" },
      leaf: { color: "#06D6A0", label: "叶" },
      fruit: { color: "#EF476F", label: "果" },
      butterfly: { color: "#A8E6CF", label: "蝶" },
      bird: { color: "#FFB347", label: "鸟" },
      water: { color: "#4CC9F0", label: "水" },
      chime: { color: "#F72585", label: "铃" },
      cooking: { color: "#FAB1A0", label: "菜" },
    },
    tags: ["官方", "暖阳"],
  },
  {
    id: "official_abyss",
    name: "深海静夜",
    author: "脑力花园",
    createdAt: 0,
    version: 1,
    bg: {
      colors: ["#04121f", "#08243a", "#0b3a52"],
      stops: [0, 0.58, 1],
      glows: [
        { color: "rgba(78,205,196,0.16)", cx: 0.18, cy: 0.26, r: 0.55 },
        { color: "rgba(76,201,240,0.12)", cx: 0.84, cy: 0.8, r: 0.6 },
      ],
    },
    board: {
      base: "rgba(6,20,34,0.88)",
      glow: "rgba(78,205,196,0.32)",
      stroke: "rgba(120,180,210,0.4)",
    },
    tiles: {
      flower: { color: "#FF6B9D", label: "花" },
      leaf: { color: "#4ECDC4", label: "叶" },
      fruit: { color: "#FFE66D", label: "果" },
      butterfly: { color: "#A8E6CF", label: "蝶" },
      bird: { color: "#FFB347", label: "鸟" },
      water: { color: "#4CC9F0", label: "水" },
      chime: { color: "#FD79A8", label: "铃" },
      cooking: { color: "#FAB1A0", label: "菜" },
    },
    tags: ["官方", "静夜"],
  },
  {
    id: "official_shuangyang",
    name: "双阳鹿乡",
    author: "脑力花园",
    createdAt: 0,
    version: 1,
    bg: {
      colors: ["#0f2a1c", "#18502f", "#caa23a"],
      stops: [0, 0.6, 1],
      glows: [
        { color: "rgba(224,168,46,0.18)", cx: 0.22, cy: 0.16, r: 0.55 },
        { color: "rgba(62,142,90,0.16)", cx: 0.84, cy: 0.84, r: 0.6 },
      ],
    },
    board: {
      base: "rgba(20,36,26,0.9)",
      glow: "rgba(224,168,46,0.32)",
      stroke: "rgba(120,170,120,0.4)",
    },
    tiles: {
      flower: { color: "#F4C95D", label: "鹿" },
      leaf: { color: "#7FD17F", label: "松" },
      fruit: { color: "#FF7BA9", label: "莓" },
      butterfly: { color: "#5BC8F5", label: "湖" },
      bird: { color: "#FF9F5A", label: "泉" },
      water: { color: "#4CC9F0", label: "水" },
      chime: { color: "#F72585", label: "铃" },
      cooking: { color: "#FAB1A0", label: "菜" },
    },
    tags: ["官方", "双阳", "鹿乡"],
  },
];

/** 按 id 取官方预设皮肤 */
export function getOfficialSkin(id: string): SkinConfig | undefined {
  return OFFICIAL_SKINS.find((s) => s.id === id);
}
