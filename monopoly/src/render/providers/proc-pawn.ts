import type { Graphics } from 'pixi.js';
import { arr, c, fb } from './proc-base';
import type { ProcCtx } from './proc';

type P = Record<string, unknown>;

/**
 * L4 内建兜底（spec §6.6）：全部设计单位几何与色值集中声明一次。
 * 这是本文件唯一允许出现裸字面量的位置；skin.json / theme.json 的 params 逐键覆盖它。
 * 设计单位：脚底 y=0，向上为负；总高 `designH` 映射到注册表 box.h（12×6×20）。
 *
 * ④ 角色 IP 化（西游·取经四众）：`params.style` 四键 ——
 *   wukong  孙悟空：毛脸雷公嘴 + 金箍 + 虎皮裙 + 猴尾（原著「毛脸雷公嘴」形态）
 *   bajie   猪八戒：长耳大腹 + 拱嘴 + 短鬃（原著「长嘴大耳朵」形态）
 *   wujing  沙悟净：蓬松卷发 + 络腮胡（原著「蓬松短发、蓝靛脸」的气质简化）
 *   sanzang 唐三藏：毗卢帽 + 红袈裟 + 金襕（原著「披袈裟、执锡杖」的取经僧形象）
 *
 * 形象只取原著特征的**公有领域**元素，不照搬任何影视剧 / 商业游戏画面；
 * 台词走 `src/data/lines.ts`（逐条标注回目）。归属色口径不变：只染「披肩 + 腰带」。
 */
const D = fb({
  designH: 24.2,
  scale: 1,
  /* ① 当前玩家光晕（spec §6.4 编码 3；AI 棋子无） */
  glow: [0, 1.3, 8.4, 3.3], glowFill: '#ffdc8c', glowA: 0.44,
  /* ② 地面投影 */
  sh: [0, 0.9, 6.4, 2.2], shFill: '#000000', shA: 0.26,
  /* ③ 双腿 + 圆头鞋（裤随僧袍色） */
  legL: [-2.9, -6.6, 2.4, 6.8, 1.1],
  legR: [0.5, -6.6, 2.4, 6.8, 1.1],
  shoeL: [-3.2, -1.5, 3, 1.9, 0.9],
  shoeR: [0.2, -1.5, 3, 1.9, 0.9],
  /* ④ 身体 + 双臂 + 双手 */
  body: [-4.3, -13.8, 8.6, 8.4, 3.2],
  armL: [-6.2, -13.2, 2.2, 6.4, 1.1],
  armR: [4, -13.2, 2.2, 6.4, 1.1],
  handL: [-5.1, -6.6, 1.25],
  handR: [5.1, -6.6, 1.25],
  /* ⑤ 腰带 + 披肩（两处**唯一**染归属色；衣服统一按角色固定色） */
  sash: [-4.6, -12.7, 9.2, 1.5, 0.7],
  scarf: [-4.6, -15.4, 9.2, 3, 1.5],
  scarfTail: [-1.6, -13.4, 3.2, 3.2, 0.9],
  /* ⑥ 通用双耳 + 大圆头（二头身：头径 ≈ 总高 43%） */
  earL: [-5.3, -18.9, 1.15],
  earR: [5.3, -18.9, 1.15],
  head: [0, -18.9, 5.3],
  /* ⑦ 悟空：猴耳 + 顶上毛 + 金箍 + 雷公嘴 + 虎皮裙 + 猴尾 */
  wuEarL: [-5.6, -19.6, 1.9], wuEarR: [5.6, -19.6, 1.9],
  wuEarInL: [-5.6, -19.6, 0.9], wuEarInR: [5.6, -19.6, 0.9],
  wuTuft: [0, -25.2, 2.6, 2.2],
  wuBand: [-5.4, -22.2, 10.8, 1.4, 0.7],
  wuMuzzle: [0, -16.6, 3.2, 2.3],
  wuKilt: [-4.6, -12.4, 9.2, 5.6, 1.4],
  wuStripe1: [-2.9, -12, 0.9, 4.8, 0.3],
  wuStripe2: [0, -12, 0.9, 4.8, 0.3],
  wuStripe3: [2.9, -12, 0.9, 4.8, 0.3],
  wuTail: [-4.6, -9, -7.4, -12, -7, -16.4],
  muzzleFill: '#f7e2c4', tigerFill: '#e8b23a', tigerStripe: '#4a3418',
  /* ⑧ 八戒：垂耳 + 拱嘴 + 鼻孔 + 猪鬃 + 大肚 */
  baEarL: [-5.8, -20.2, 2.2, 3.7], baEarR: [5.8, -20.2, 2.2, 3.7],
  baEarInL: [-5.8, -20.4, 1.2, 2.2], baEarInR: [5.8, -20.4, 1.2, 2.2],
  baBristle: [0, -24.4, 1.8],
  baSnout: [0, -15.8, 3, 2],
  baNostrilL: [-1.3, -15.9, 0.45], baNostrilR: [1.3, -15.9, 0.45],
  baBelly: [0, -10, 4.4, 3.2],
  snoutFill: '#eda88f', nostrilFill: '#8c5a4c', bellyFill: '#f3e6cd',
  /* ⑨ 悟净：蓬松卷发 + 络腮胡 */
  saHair: [-4.9, -23.8, 9.8, 2.4, 1.2],
  saCurl1: [-3.6, -24.6, 1.5], saCurl2: [0, -25.2, 1.6], saCurl3: [3.6, -24.6, 1.5],
  saBeardL: [-4.7, -16.6, 1.7, 2.4], saBeardR: [4.7, -16.6, 1.7, 2.4],
  saBeardChin: [0, -15.2, 3, 2],
  /* ⑩ 三藏：毗卢帽（帽身 + 帽箍 + 顶珠）+ 金襕 */
  taHatDome: [0, -25.2, 4.5, 2.6],
  taHatBand: [-5.1, -23.4, 10.2, 1.4, 0.6],
  taHatTip: [0, -28.1, 1.1],
  taKasayaTrim: [-4.4, -13.6, 8.8, 1.3, 0.6],
  hatchFill: '#e0a92e', hatBandFill: '#c98c1c', hatTipFill: '#f6d271',
  /* ⑪ calm：圆眼 + 白高光 + 腮红 + 小弧嘴 */
  eyeL: [-1.95, -19.3, 1.35, 1.55],
  eyeR: [1.95, -19.3, 1.35, 1.55],
  pupilL: [-2.4, -19.85, 0.55],
  pupilR: [1.5, -19.85, 0.55],
  cheekL: [-3.5, -17.3, 1.15, 0.8],
  cheekR: [3.5, -17.3, 1.15, 0.8],
  mouthCalm: [-1.1, -17.3, 0, -16.4, 1.1, -17.3],
  /* ⑫ happy：弯月眼 ^ ^ + 张嘴笑 + 大腮红 */
  happyEyeL: [-3.1, -19.2, -1.95, -20.7, -0.8, -19.2],
  happyEyeR: [0.8, -19.2, 1.95, -20.7, 3.1, -19.2],
  cheekWideL: [-3.5, -17.3, 1.5, 1.05],
  cheekWideR: [3.5, -17.3, 1.5, 1.05],
  happyMouth: [0, -16.6, 2, 1.1],
  /* ⑬ sad：八字眉 + 下垂眼 + 扁嘴 + 眼角一滴泪 */
  sadBrowL: [-3.2, -21.7, -1.5, -20.9],
  sadBrowR: [3.2, -21.7, 1.5, -20.9],
  sadEyeL: [-1.95, -18.9, 1.3, 1.45],
  sadEyeR: [1.95, -18.9, 1.3, 1.45],
  sadPupilL: [-2.35, -19.4, 0.5],
  sadPupilR: [1.55, -19.4, 0.5],
  sadCheekL: [-3.4, -17.2, 1.15, 0.8],
  sadCheekR: [3.4, -17.2, 1.15, 0.8],
  tear: [2.9, -15.2, 0.55, 1.1],
  sadMouth: [-1.3, -16.8, 0, -17.5, 1.3, -16.8],
  /* ⑭ 色值（衣服按角色；归属只染披肩与腰带） */
  skin: '#ffe2c8', cloth: '#fdf6e8', hair: '#3b2b22', shoe: '#3a2f28',
  eye: '#2b2320', white: '#ffffff', mouthFill: '#b5726a', trim: '#3fbf7f',
  accent: '#f0c04a',
  cheekFill: '#f0938f', cheekA: 0.42, cheekAUp: 0.5, cheekADown: 0.35,
  happyMouthFill: '#c05050', tearFill: '#8fd4ff',
  strokeW: 0.9, browW: 0.85,
  /* ⑮ 逐角色定色（skin.json 的 robe / headFill / hair 仍可逐键覆盖） */
  robeMap: {
    wukong: '#fdf6e8', bajie: '#fdf6e8', wujing: '#fdf6e8', sanzang: '#c8402f',
  },
  headMap: {
    wukong: '#d8a463', bajie: '#f6c9ae', wujing: '#ffe2c8', sanzang: '#ffe2c8',
  },
  hairMap: {
    wukong: '#3b2b22', bajie: '#e3a882', wujing: '#2f2a26', sanzang: '#2f2a26',
  },
});

/**
 * 西游·取经四众棋子（spec §6.6 二头身 Q 版）。
 * 造型靠**头饰与轮廓**区分（32px 下仍可辨）：猴耳 + 金箍 / 垂耳 + 拱嘴 / 络腮胡 / 毗卢帽。
 * 归属色只染「披肩 + 腰带」，故四个角色同屏仍能一眼看出谁是谁的资产。
 * `state.mood`: calm | happy | sad（离散三态）；`state.owner`: 1..4。
 */
export function pawn(g: Graphics, ctx: ProcCtx): void {
  const { cx, cy, params, state } = ctx;
  const p = params as P;
  const st = state as P;

  /* 取值器：params 优先，缺则落 L4 内建兜底 D */
  const n = (k: string): number => (typeof p[k] === 'number' ? (p[k] as number) : (D as P)[k] as number);
  const col = (k: string): string => c(p, k, (D as P)[k] as string);
  const pts = (k: string): number[] => arr<number>(p, k) ?? ((D as P)[k] as number[]);
  const mapOf = (k: string): Record<string, string> => ((D as P)[k] ?? {}) as Record<string, string>;

  /* 设计单位 → 屏幕：总高 designH 映射到注册表 box.h（ctx.s = 台位缩放） */
  const u = (ctx.s * n('scale') * ctx.box.h) / n('designH');
  const X = (dx: number): number => cx + dx * u;
  const Y = (dy: number): number => cy + dy * u;

  const style = c(p, 'style', 'wukong');
  const mood = typeof st.mood === 'string' ? (st.mood as string) : 'calm';
  const owner = typeof st.owner === 'number' ? (st.owner as number) : 1;
  const ownerColors = (st.ownerColors ?? {}) as Record<number, string>;
  const trim = ownerColors[owner] ?? col('trim');
  const skin = col('skin');
  const robe = c(p, 'robe', mapOf('robeMap')[style] ?? col('cloth'));
  const headFill = c(p, 'headFill', mapOf('headMap')[style] ?? skin);
  const hair = c(p, 'hair', mapOf('hairMap')[style] ?? col('hair'));

  /** 设计单位椭圆：点串 [x, y, rx, ry] */
  const ell = (k: string, color: string, alpha?: number): void => {
    const a = pts(k);
    g.ellipse(X(a[0]), Y(a[1]), a[2] * u, a[3] * u).fill(alpha === undefined ? { color } : { color, alpha });
  };
  /** 设计单位圆：点串 [x, y, r] */
  const cir = (k: string, color: string, alpha?: number): void => {
    const a = pts(k);
    g.circle(X(a[0]), Y(a[1]), a[2] * u).fill(alpha === undefined ? { color } : { color, alpha });
  };
  /** 设计单位圆角矩形：点串 [x, y, w, h, r] */
  const rect = (k: string, color: string, alpha?: number): void => {
    const a = pts(k);
    g.roundRect(X(a[0]), Y(a[1]), a[2] * u, a[3] * u, a[4] * u)
      .fill(alpha === undefined ? { color } : { color, alpha });
  };
  /** 设计单位折线：点串 [x, y, x, y, ...]；线宽取 `wk` 键（设计单位） */
  const line = (k: string, color: string, wk: string): void => {
    const a = pts(k);
    g.moveTo(X(a[0]), Y(a[1]));
    for (let i = 2; i + 1 < a.length; i += 2) g.lineTo(X(a[i]), Y(a[i + 1]));
    g.stroke({ color, width: n(wk) * u });
  };

  /* ① 当前玩家光晕（与 AI 棋子一眼区分） */
  if (st.active === true) ell('glow', col('glowFill'), n('glowA'));
  /* ② 地面投影 */
  ell('sh', col('shFill'), n('shA'));

  /* ③ 角色后层（须被身躯压住的部分：只有猴尾） */
  if (style === 'wukong') line('wuTail', hair, 'strokeW');

  /* ④ 双腿 + 圆头鞋 */
  rect('legL', robe);
  rect('legR', robe);
  rect('shoeL', col('shoe'));
  rect('shoeR', col('shoe'));
  /* ⑤ 身体 + 双臂 + 双手 */
  rect('body', robe);
  if (style === 'wukong') {
    rect('wuKilt', col('tigerFill'));
    rect('wuStripe1', col('tigerStripe'));
    rect('wuStripe2', col('tigerStripe'));
    rect('wuStripe3', col('tigerStripe'));
  } else if (style === 'bajie') {
    ell('baBelly', col('bellyFill'));
  } else if (style === 'sanzang') {
    rect('taKasayaTrim', col('accent'));
  }
  rect('armL', robe);
  rect('armR', robe);
  cir('handL', skin);
  cir('handR', skin);
  /* ⑥ 腰带 + 披肩（均染归属色） */
  rect('sash', trim);
  rect('scarf', trim);
  rect('scarfTail', trim);

  /* ⑦ 头（肤色按角色：悟空猴毛 / 八戒粉皮 / 沙僧与三藏人脸） */
  if (style !== 'wukong' && style !== 'bajie') {
    cir('earL', headFill);
    cir('earR', headFill);
  }
  cir('head', headFill);

  /* ⑧ 头饰与面部特征（压在头上；耳与头同色，接缝不可见） */
  if (style === 'wukong') {
    cir('wuEarL', headFill);
    cir('wuEarR', headFill);
    cir('wuEarInL', col('muzzleFill'));
    cir('wuEarInR', col('muzzleFill'));
    ell('wuTuft', hair);
    rect('wuBand', col('accent'));
    ell('wuMuzzle', col('muzzleFill'));
  } else if (style === 'bajie') {
    ell('baEarL', headFill);
    ell('baEarR', headFill);
    ell('baEarInL', col('snoutFill'));
    ell('baEarInR', col('snoutFill'));
    cir('baBristle', hair);
    ell('baSnout', col('snoutFill'));
    cir('baNostrilL', col('nostrilFill'));
    cir('baNostrilR', col('nostrilFill'));
  } else if (style === 'wujing') {
    rect('saHair', hair);
    cir('saCurl1', hair);
    cir('saCurl2', hair);
    cir('saCurl3', hair);
    ell('saBeardL', hair);
    ell('saBeardR', hair);
    ell('saBeardChin', hair);
  } else if (style === 'sanzang') {
    ell('taHatDome', col('hatchFill'));
    rect('taHatBand', col('hatBandFill'));
    cir('taHatTip', col('hatTipFill'));
  }

  /* ⑨ 表情（离散三态，spec §6.6） */
  if (mood === 'happy') {
    line('happyEyeL', col('eye'), 'strokeW');
    line('happyEyeR', col('eye'), 'strokeW');
    ell('cheekWideL', col('cheekFill'), n('cheekAUp'));
    ell('cheekWideR', col('cheekFill'), n('cheekAUp'));
    ell('happyMouth', col('happyMouthFill'));
  } else if (mood === 'sad') {
    line('sadBrowL', col('eye'), 'browW');
    line('sadBrowR', col('eye'), 'browW');
    ell('sadEyeL', col('eye'));
    ell('sadEyeR', col('eye'));
    cir('sadPupilL', col('white'));
    cir('sadPupilR', col('white'));
    ell('sadCheekL', col('cheekFill'), n('cheekADown'));
    ell('sadCheekR', col('cheekFill'), n('cheekADown'));
    ell('tear', col('tearFill'));
    line('sadMouth', col('mouthFill'), 'browW');
  } else {
    ell('eyeL', col('eye'));
    ell('eyeR', col('eye'));
    cir('pupilL', col('white'));
    cir('pupilR', col('white'));
    ell('cheekL', col('cheekFill'), n('cheekA'));
    ell('cheekR', col('cheekFill'), n('cheekA'));
    line('mouthCalm', col('mouthFill'), 'browW');
  }
}