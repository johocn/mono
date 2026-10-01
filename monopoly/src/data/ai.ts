/**
 * AI 性格档案（spec §4.2）：标签 / 参数表 / URL 解析。
 * 放 `data/` 而非 `core/`：`core/ai.ts` 需要读参数表，而 `core → data` 是本仓库既有方向
 * （`core/game.ts` 已 import `data/board`、`data/cards`、`data/stocks`）；若把参数表放 core，
 * 反而会让 `ui/setup.ts`（只需标签）产生 `ui → core` 的新依赖。
 */

export type Persona = 'conservative' | 'aggressive' | 'speculative';

/** 席位归属：`null` = 真人，否则为 AI 性格 */
export type Seat = Persona | null;

export const PERSONAS: Persona[] = ['conservative', 'aggressive', 'speculative'];

export const PERSONA_LABEL: Record<Persona, string> = {
  conservative: '保守', aggressive: '激进', speculative: '投机',
};

/** 开局面板徽标卡的一句话说明（≤ 8 字） */
export const PERSONA_DESC: Record<Persona, string> = {
  conservative: '稳守 · 留钱', aggressive: '猛攻 · 盯第一', speculative: '捡漏 · 打股',
};

/** 其余席位按序补 AI 的默认顺序（spec §6） */
export const DEFAULT_AI_ORDER: Persona[] = ['conservative', 'aggressive', 'speculative'];

/** 投机仅在末段（round ≥ 此值）才针对领先者（spec §4.2） */
export const SPEC_LEADER_MIN_ROUND = 8;

export interface AiParams {
  reserve: number;
  buyMax: number;
  upgradeEager: boolean;
  cardPolicy: 'defensive' | 'offensive' | 'arbitrage';
  stockPolicy: 'none' | 'momentum' | 'dip';
  targetLeader: boolean;
  /** 拍卖估值倍率（M20.1）：保守 0.6 / 激进 1.4 / 投机 1.0 */
  bidMult: number;
}

export const PERSONA_PARAMS: Record<Persona, AiParams> = {
  conservative: { reserve: 400, buyMax: 300, upgradeEager: false, cardPolicy: 'defensive', stockPolicy: 'none', targetLeader: false, bidMult: 0.6 },
  aggressive: { reserve: 100, buyMax: Infinity, upgradeEager: true, cardPolicy: 'offensive', stockPolicy: 'momentum', targetLeader: true, bidMult: 1.4 },
  speculative: { reserve: 200, buyMax: Infinity, upgradeEager: true, cardPolicy: 'arbitrage', stockPolicy: 'dip', targetLeader: true, bidMult: 1.0 },
};

export function personaParams(p: Persona): AiParams {
  return PERSONA_PARAMS[p];
}

export function isPersona(v: string): v is Persona {
  return (PERSONAS as string[]).includes(v);
}

/** `?ai=conservative,aggressive,speculative` → 合法项按原序保留，非法项静默丢弃 */
export function parsePersonaList(raw: string | null): Persona[] {
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(isPersona);
}