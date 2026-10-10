/**
 * FaceAvatar — 程序化头像绘制
 *
 * 按 seed 确定性生成可区分的面孔（肤色 / 发型 / 眼镜 / 脸型 / 配饰），
 * 零外部素材，与游戏 emoji 风格一致。用于「面孔-名字联想」玩法，
 * 让每张脸都好认又不雷同。
 */

const SKIN = ["#F8D9B0", "#F3C89A", "#E7B07A", "#CD924F", "#A66A3A", "#7C4A28"];
const HAIR = ["#2B2B2B", "#463422", "#6B4423", "#9C7A3C", "#B9B9B9", "#D8C27A", "#5A3210"];
const HAT_COLORS = ["#C0563F", "#3C6E8F", "#6B8E3C"];

function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 由关卡 id + 序号得到稳定且不相邻的 seed（相邻面孔差异明显） */
export function faceSeedFor(levelId: string, index: number): number {
  const base = hashStr(levelId);
  return ((base + index * 97) % 300) + 1;
}

/**
 * 在 (cx, cy) 处绘制边长 size 的头像（seed 决定长相）。
 * 绘制坐标归一化到 -1..1，再按 size/2 缩放。
 */
export function drawFace(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  seed: number,
): void {
  const rnd = mulberry32((seed * 2654435761) >>> 0);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];

  const skin = pick(SKIN);
  const hair = pick(HAIR);
  const hairStyle = Math.floor(rnd() * 5); // 0 短刘海 1 中分 2 发髻 3 偏分 4 光头
  const glasses = rnd() < 0.4;
  const mouth = Math.floor(rnd() * 3);
  const accessory = Math.floor(rnd() * 3); // 0 无 1 耳环 2 帽子
  const blush = rnd() < 0.5;

  ctx.save();
  ctx.translate(cx, cy);
  const s = size / 2;
  ctx.scale(s, s); // 归一化到 -1..1

  // 脖子
  ctx.fillStyle = skin;
  ctx.fillRect(-0.16, 0.5, 0.32, 0.32);

  // 头发后层（比脸略大，露出边缘即像头发）
  if (hairStyle !== 4) {
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.ellipse(0, -0.04, 0.7, 0.76, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 耳朵
  ctx.fillStyle = skin;
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(sx * 0.62, 0.02, 0.08, 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 脸
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.6, 0.68, 0, 0, Math.PI * 2);
  ctx.fill();

  // 眼睛
  const eyeX = 0.23;
  const eyeY = -0.02;
  ctx.fillStyle = "#fff";
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(sx * eyeX, eyeY, 0.1, 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#3A3A3A";
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(sx * eyeX, eyeY, 0.04, 0, Math.PI * 2);
    ctx.fill();
  }

  // 眉毛
  ctx.strokeStyle = hair;
  ctx.lineWidth = 0.05;
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sx * (eyeX - 0.11), eyeY - 0.13);
    ctx.quadraticCurveTo(sx * eyeX, eyeY - 0.2, sx * (eyeX + 0.11), eyeY - 0.11);
    ctx.stroke();
  }

  // 眼镜
  if (glasses) {
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 0.035;
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(sx * eyeX, eyeY, 0.14, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-eyeX + 0.14, eyeY);
    ctx.lineTo(eyeX - 0.14, eyeY);
    ctx.stroke();
  }

  // 鼻子
  ctx.strokeStyle = "rgba(120,80,60,0.55)";
  ctx.lineWidth = 0.04;
  ctx.beginPath();
  ctx.moveTo(0, 0.04);
  ctx.lineTo(0.05, 0.16);
  ctx.lineTo(-0.02, 0.18);
  ctx.stroke();

  // 嘴
  ctx.strokeStyle = "#B5544E";
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  if (mouth === 0) {
    ctx.arc(0, 0.27, 0.15, 0.15 * Math.PI, 0.85 * Math.PI);
  } else if (mouth === 1) {
    ctx.moveTo(-0.15, 0.32);
    ctx.lineTo(0.15, 0.32);
  } else {
    ctx.ellipse(0, 0.33, 0.09, 0.06, 0, 0, Math.PI * 2);
  }
  ctx.stroke();

  // 腮红
  if (blush) {
    ctx.fillStyle = "rgba(230,130,120,0.35)";
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(sx * 0.34, 0.16, 0.09, 0.06, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 头发前层（刘海）
  ctx.fillStyle = hair;
  if (hairStyle === 0) {
    ctx.beginPath();
    ctx.ellipse(0, -0.22, 0.64, 0.4, 0, Math.PI, 0, true);
    ctx.fill();
  } else if (hairStyle === 1) {
    ctx.beginPath();
    ctx.moveTo(-0.6, -0.1);
    ctx.quadraticCurveTo(0, -0.58, 0.6, -0.1);
    ctx.quadraticCurveTo(0, -0.34, -0.6, -0.1);
    ctx.fill();
  } else if (hairStyle === 2) {
    ctx.beginPath();
    ctx.arc(0, -0.6, 0.18, 0, Math.PI * 2);
    ctx.fill();
  } else if (hairStyle === 3) {
    ctx.beginPath();
    ctx.moveTo(-0.6, -0.16);
    ctx.quadraticCurveTo(-0.1, -0.62, 0.55, -0.26);
    ctx.quadraticCurveTo(0.1, -0.36, -0.6, -0.16);
    ctx.fill();
  }

  // 配饰
  if (accessory === 1) {
    ctx.fillStyle = "#E0B84A";
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(sx * 0.62, 0.12, 0.045, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (accessory === 2) {
    ctx.fillStyle = pick(HAT_COLORS);
    ctx.beginPath();
    ctx.ellipse(0, -0.5, 0.78, 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, -0.6, 0.44, 0.3, 0, Math.PI, 0, true);
    ctx.fill();
  }

  ctx.restore();
}
