/**
 * 套装表（数据驱动）。装备在 ItemDef.set 标注所属套装，
 * Player.equipStat 在穿戴达 n 件时叠加对应加成（多件套可叠加）。
 */
export interface SetEffect {
  atk?: number;
  def?: number;
  spd?: number;
  crit?: number;
}

export interface SetPiece {
  /** 需要同时穿戴的件数 */
  need: number;
  effect: SetEffect;
}

export interface SetDef {
  name: string;
  pieces: SetPiece[];
}

export const SETS: Record<string, SetDef> = {
  "xuan-shui": {
    name: "玄水套装",
    pieces: [{ need: 2, effect: { atk: 8, def: 6 } }],
  },
};
