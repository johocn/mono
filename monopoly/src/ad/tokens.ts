/**
 * 广告宣传版（M21）· 公共样式变量（唯一真源）
 *
 * 硬规范：广告层（DOM 商城 / 紧凑 HUD）**禁止硬编码任何色值**——
 *   · 全部配色键集中在本文件（`AD_TOKEN_DEFAULTS`）；
 *   · `applyAdTokens()` 把每个键注入为 `--ad-*` CSS 变量，组件 CSS 只消费 `var(--ad-*)`；
 *   · 方案配置（`AdPlanConfig.theme`）只能 Partial 覆盖这些键，不允许新增私有色键；
 *   · 切换方案时全量重注（缺省键回落默认值）→ 无残留样式。
 * canvas 层（迷你棋盘）配色走 `config/theme.json` 调色板（`AdPlanConfig.palette`），
 * 同样不硬编码。
 */

/** 全部 token 键（与 `AdTokenKey` 同步；apply/clear 按本表全量操作） */
export const AD_TOKEN_KEYS = [
  'bg', 'bgDeep', 'gold', 'brown', 'tan', 'brick',
  'card', 'cardEdge', 'accent',
  'text', 'textDim', 'onGold', 'onAccent',
  'shadow', 'heroA', 'heroB', 'canvasBg',
] as const;

export type AdTokens = Record<(typeof AD_TOKEN_KEYS)[number], string>;

/**
 * 全局默认配色（方案 A 橱窗商城定稿色板）：
 * 奶油白底 + 暖金主色 + 深棕文字 + 砖红点缀；其余四案只做 Partial 覆盖。
 */
export const AD_TOKEN_DEFAULTS: AdTokens = {
  bg: '#f6efe3',        /* 奶油白：广告区底 */
  bgDeep: '#f1e8d6',    /* 米黄深：Tab 栏 / 次级面 */
  gold: '#f5c451',      /* 暖金：主按钮 / 高亮 */
  brown: '#4a3b2a',     /* 深棕：主文字 / 描边 */
  tan: '#8a7550',       /* 褐：次级文字 / 分隔 */
  brick: '#8f4a33',     /* 砖红：营销点缀 */
  card: '#fdf8ec',      /* 卡底 */
  cardEdge: '#e3d3b0',  /* 卡边 */
  accent: '#c0392b',    /* 强调红：券 / 警示 */
  text: '#4a3b2a',      /* 正文（= brown，独立键便于换肤） */
  textDim: '#8a7550',   /* 弱化文字（= tan） */
  onGold: '#4a3b2a',    /* 金底上的文字 */
  onAccent: '#ffffff',  /* 红底上的文字 */
  shadow: 'rgba(74, 59, 42, 0.18)',       /* 投影 */
  heroA: '#f5c451',     /* hero 渐变起 */
  heroB: '#8f4a33',     /* hero 渐变止 */
  canvasBg: '#f6efe3',  /* canvas 舞台底色（迷你棋盘衬底） */
};

/** 键名 → CSS 变量名（camelCase → kebab：bgDeep → --ad-bg-deep） */
export function adVarName(key: string): string {
  return `--ad-${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`;
}

/** 取 token 值：方案覆盖 → 全局默认（兜底链唯一出口） */
export function adToken(key: string, over?: Partial<AdTokens>): string {
  return over?.[key as keyof AdTokens] ?? AD_TOKEN_DEFAULTS[key as keyof AdTokens];
}

/** 把整套 token 注入为 CSS 变量（全量写入：方案未覆盖的键回落默认，杜绝上一案残留） */
export function applyAdTokens(root: HTMLElement, over?: Partial<AdTokens>): void {
  for (const key of AD_TOKEN_KEYS) {
    root.style.setProperty(adVarName(key), adToken(key, over));
  }
}

/** 清除整套 CSS 变量（卸载 / 换肤自检用） */
export function clearAdTokens(root: HTMLElement): void {
  for (const key of AD_TOKEN_KEYS) {
    root.style.removeProperty(adVarName(key));
  }
}
