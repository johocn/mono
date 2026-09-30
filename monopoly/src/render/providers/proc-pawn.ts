import type { Graphics } from 'pixi.js';
import { arr, c, fb } from './proc-base';
import type { ProcCtx } from './proc';

type P = Record<string, unknown>;

/**
 * L4 内建兜底（spec §6.6）：全部设计单位几何与色值集中声明一次。
 * 这是本文件唯一允许出现裸字面量的位置；skin.json / theme.json 的 params 逐键覆盖它。
 * 设计单位：脚底 y=0，向上为负；总高 `designH` 映射到注册表 box.h（12×6×20）。
 */
const D = fb({
  designH: 24.2,
  scale: 1,
  /* ① 当前玩家光晕（spec §6.4 编码 3；AI 棋子无） */
  glow: [0, 1.3, 8.2, 3.2], glowFill: '#ffdc8c', glowA: 0.44,
  /* ② 地面投影 */
  sh: [0, 0.9, 6, 2.1], shFill: '#000000', shA: 0.26,
  /* ③ 双腿 + 圆头鞋 */
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
  /* ⑤ 围巾 + 铃铛（围巾染归属色） */
  scarf: [-4.5, -15.2, 9, 2.7, 1.35],
  scarfTail: [-1.5, -13.6, 3, 3.4, 0.9],
  bell: [0, -10.7, 1.2], bellFill: '#f5c451',
  /* ⑥ 头发后层（女孩双马尾 / 丸子头） */
  ponyL: [-6.6, -17.4, 2.2, 3],
  ponyR: [6.6, -17.4, 2.2, 3],
  bun: [0, -24.8, 2.4],
  /* ⑦ 双耳 + 大圆头 + 刘海（二头身：头径 ≈ 总高 43%） */
  earL: [-5.3, -18.9, 1.15],
  earR: [5.3, -18.9, 1.15],
  head: [0, -18.9, 5.3],
  bang: [0, -21.9, 5.45, 2.95],
  /* ⑧ 头饰（亦染归属色：发圈 / 丸子头绳 / 小帽） */
  tieL: [-5.7, -18.9, 1],
  tieR: [5.7, -18.9, 1],
  bunTie: [0, -23.5, 2.5, 0.8],
  cap: [0, -22.3, 5.6, 3],
  capBrim: [-3.4, -21.7, 6.8, 1.5, 0.75],
  /* ⑨ calm：圆眼 + 白高光 + 腮红 + 小弧嘴 */
  eyeL: [-1.95, -19.3, 1.35, 1.55],
  eyeR: [1.95, -19.3, 1.35, 1.55],
  pupilL: [-2.4, -19.85, 0.55],
  pupilR: [1.5, -19.85, 0.55],
  cheekL: [-3.5, -17.3, 1.15, 0.8],
  cheekR: [3.5, -17.3, 1.15, 0.8],
  mouthCalm: [-1.1, -17.3, 0, -16.4, 1.1, -17.3],
  /* ⑨ happy：弯月眼 ^ ^ + 张嘴笑 + 大腮红 */
  happyEyeL: [-3.1, -19.2, -1.95, -20.7, -0.8, -19.2],
  happyEyeR: [0.8, -19.2, 1.95, -20.7, 3.1, -19.2],
  cheekWideL: [-3.5, -17.3, 1.5, 1.05],
  cheekWideR: [3.5, -17.3, 1.5, 1.05],
  happyMouth: [0, -16.6, 2, 1.1],
  /* ⑨ sad：八字眉 + 下垂眼 + 扁嘴 + 眼角一滴泪 */
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
  /* 色值（衣服统一米白；归属只染围巾与头饰） */
  skin: '#ffe2c8', cloth: '#fdf6e8', hair: '#3b2b22', shoe: '#3a2f28',
  eye: '#2b2320', white: '#ffffff', mouthFill: '#b5726a', trim: '#3fbf7f',
  cheekFill: '#f0938f', cheekA: 0.42, cheekAUp: 0.5, cheekADown: 0.35,
  happyMouthFill: '#c05050', tearFill: '#8fd4ff',
  strokeW: 0.9, browW: 0.85,
});

/**
 * Q 版小朋友棋子（spec §6.6 / 计划 Task 7）：二头身 + 大眼睛高光 + 腮红 + 围巾铃铛。
 * 归属只染「围巾 + 头饰」，衣服统一米白 ⇒ 既可爱又保留归属识别。
 * `params.style`: short（男·短发）/ twintail（女·双马尾）/ cap（男·小帽）/ bun（女·丸子头）；
 * `state.mood`: calm | happy | sad（离散三态，非逐帧动画）；
 * `state.owner`: 1..4 —— 围巾色取 `state.ownerColors[owner]`（skin tokens 的 `owner1..4`）。
 */
export function pawn(g: Graphics, ctx: ProcCtx): void {
  const { cx, cy, params, state } = ctx;
  const p = params as P;
  const st = state as P;

  /* 取值器：params 优先，缺则落 L4 内建兜底 D */
  const n = (k: string): number => (typeof p[k] === 'number' ? (p[k] as number) : (D as P)[k] as number);
  const col = (k: string): string => c(p, k, (D as P)[k] as string);
  const pts = (k: string): number[] => arr<number>(p, k) ?? ((D as P)[k] as number[]);

  /* 设计单位 → 屏幕：总高 designH 映射到注册表 box.h（ctx.s = 台位缩放 0.62） */
  const u = (ctx.s * n('scale') * ctx.box.h) / n('designH');
  const X = (dx: number): number => cx + dx * u;
  const Y = (dy: number): number => cy + dy * u;

  const style = typeof p.style === 'string' ? (p.style as string) : 'short';
  const mood = typeof st.mood === 'string' ? (st.mood as string) : 'calm';
  const owner = typeof st.owner === 'number' ? (st.owner as number) : 1;
  const ownerColors = (st.ownerColors ?? {}) as Record<number, string>;
  const trim = ownerColors[owner] ?? col('trim');
  const skin = col('skin');
  const cloth = col('cloth');
  const hair = col('hair');
  const shoe = col('shoe');
  const eye = col('eye');

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
  /* ③ 双腿 + 圆头鞋 */
  rect('legL', cloth);
  rect('legR', cloth);
  rect('shoeL', shoe);
  rect('shoeR', shoe);
  /* ④ 身体 + 双臂 + 双手 */
  rect('body', cloth);
  rect('armL', cloth);
  rect('armR', cloth);
  cir('handL', skin);
  cir('handR', skin);
  /* ⑤ 围巾 + 铃铛（围巾染归属色） */
  rect('scarf', trim);
  rect('scarfTail', trim);
  cir('bell', col('bellFill'));
  /* ⑥ 头发后层（性别靠发型轮廓区分） */
  if (style === 'twintail') {
    ell('ponyL', hair);
    ell('ponyR', hair);
  } else if (style === 'bun') {
    cir('bun', hair);
  }
  /* ⑦ 双耳 + 大圆头 + 刘海 */
  cir('earL', skin);
  cir('earR', skin);
  cir('head', skin);
  ell('bang', hair);
  /* ⑧ 头饰（亦染归属色） */
  if (style === 'twintail') {
    cir('tieL', trim);
    cir('tieR', trim);
  } else if (style === 'bun') {
    ell('bunTie', trim);
  } else if (style === 'cap') {
    ell('cap', trim);
    rect('capBrim', trim);
  }
  /* ⑨ 表情（离散三态，spec §6.6） */
  if (mood === 'happy') {
    line('happyEyeL', eye, 'strokeW');
    line('happyEyeR', eye, 'strokeW');
    ell('cheekWideL', col('cheekFill'), n('cheekAUp'));
    ell('cheekWideR', col('cheekFill'), n('cheekAUp'));
    ell('happyMouth', col('happyMouthFill'));
  } else if (mood === 'sad') {
    line('sadBrowL', eye, 'browW');
    line('sadBrowR', eye, 'browW');
    ell('sadEyeL', eye);
    ell('sadEyeR', eye);
    cir('sadPupilL', col('white'));
    cir('sadPupilR', col('white'));
    ell('sadCheekL', col('cheekFill'), n('cheekADown'));
    ell('sadCheekR', col('cheekFill'), n('cheekADown'));
    ell('tear', col('tearFill'));
    line('sadMouth', col('mouthFill'), 'browW');
  } else {
    ell('eyeL', eye);
    ell('eyeR', eye);
    cir('pupilL', col('white'));
    cir('pupilR', col('white'));
    ell('cheekL', col('cheekFill'), n('cheekA'));
    ell('cheekR', col('cheekFill'), n('cheekA'));
    line('mouthCalm', col('mouthFill'), 'browW');
  }
}