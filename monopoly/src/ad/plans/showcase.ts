/**
 * 广告宣传版 · 方案 A「橱窗商城」（showcase）完整配置
 *
 * 版式：广告区 0..563 = hero 轮播 96 + 商圈 Tab 22 + 双列商品卡网格；
 * 游戏区 563..844 = 迷你棋盘（geo 见 adLayout.AD_GEO）+ 紧凑 HUD。
 * 落格联动：玩家停到有商家的格 → 商城对应卡高亮 + 滚动到位；有券（couponTemplateId）弹券。
 *
 * 配色纪律：本文件不出现任何色值——缺省全用 `tokens.ts` 默认板；
 * 布局数值只引用 `adLayout.ts` 常量（保持唯一来源）。
 */
import { TILE_SHORT, TILE_TYPES, TIER_NAME, tierOf } from '../../data/board';
import { AD_HERO_H, AD_TAB_H, AD_ZONE_H } from '../adLayout';
import type { AdDemoProduct, AdPlanConfig, AdTone } from '../types';

/** 占位商品卡：shops.json 为空（商家未书面授权）时，从棋盘商家格动态生成（不另造假店名） */
function demoProducts(): AdDemoProduct[] {
  const tones: AdTone[] = ['gold', 'brick', 'tan'];
  const out: AdDemoProduct[] = [];
  TILE_TYPES.forEach((type, slot) => {
    if (type !== 'shop' && slot !== 0) return;   // 商家格 + 起点
    out.push({
      slot,
      title: TILE_SHORT[slot],
      sub: TIER_NAME[tierOf(slot) ?? 'core'],
      tag: '到店礼',
      tone: tones[out.length % tones.length],
    });
  });
  return out;
}

export const SHOWCASE_PLAN: AdPlanConfig = {
  id: 'showcase',
  name: '橱窗商城',
  desc: '上 2/3 橱窗式双列商品卡 + 商圈 Tab 过滤；下 1/3 迷你棋盘延续原版玩法，落格联动高亮与弹券。',
  palette: 'warm-market',
  canvasBgKey: 'canvasBg',
  layout: { heroH: AD_HERO_H, tabH: AD_TAB_H, zoneH: AD_ZONE_H },
  hero: [
    { title: '双阳邻里 · 街坊好店', sub: '掷骰逛遍 32 家街坊铺子', tone: 'gold' },
    { title: '领券到店', sub: '落格即弹商家券，到店核销', tone: 'brick' },
    { title: '温泉 · 鹿乡 · 采摘', sub: '文旅商圈一网打尽', tone: 'tan' },
    { title: '广告位招租', sub: '商家认领请联系运营', tone: 'plain' },
  ],
  tabs: [
    { id: 'all', label: '全部', tier: null },
    { id: 'core', label: TIER_NAME.core, tier: 'core' },
    { id: 'tourism', label: TIER_NAME.tourism, tier: 'tourism' },
    { id: 'town', label: TIER_NAME.town, tier: 'town' },
  ],
  demo: demoProducts(),
};
