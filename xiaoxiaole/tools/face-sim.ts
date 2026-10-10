/**
 * 面孔-名字（face）关卡阈值校准模拟器
 *
 * 与 tools/balance-sim.ts 同一哲学：不要拍脑袋定数字，用模型给出建议。
 * 但 face 不是随机策略游戏（回忆是确定性的），没有可枚举的「随机可行解」，
 * 因此改用「记忆保持模型 + 精确二项分布」：
 *
 *   记住某个人的概率 r = 初始保持率 p0 × 延迟衰减 exp(-D/τ) × 记忆负荷惩罚
 *   没记住时会在 options 个选项里瞎猜 → 命中概率 1/options
 *   ⇒ 单题正确概率 q = r + (1 - r) / options
 *   各题独立 ⇒ 正确数服从二项分布 B(N, q)，可精确计算（无抽样噪声、结果可复现）
 *
 * 校准哲学（沿用 balance-sim「认真玩基本能过、三星才需技巧」）：
 *   ① 上限：一般玩家通过率 ≥85% ⇒ 过关不靠运气
 *   ② 下限：纯盲猜通过率需被压到 ≤25% ⇒ 过关确实反映记忆，而非瞎蒙
 *   ③ 过关阈值 ≠ N（全对留给三星），「过关」不与三星等价
 *
 * ⚠ 注意：p0/τ/负荷系数是「文献量级的合理假设」，不是本项目的真实用户数据。
 *   本工具用于发现「明显不合理的阈值」（例如要求近乎全对），
 *   最终手感仍应以真人试玩为准。
 *
 * 运行：npm run facebalance
 */

import { GEN_FACE, type LevelConfig } from "../src/config/LevelConfig";

interface Profile {
  name: string;
  p0: number;   // 零延迟、3 人负荷下的初始保持率
  tau: number;  // 遗忘时间常数（秒），越大记得越久
  load: number; // 每多一个人的负荷惩罚系数
}

const PROFILES: Profile[] = [
  { name: "偏弱", p0: 0.80, tau: 9, load: 0.06 },
  { name: "一般", p0: 0.90, tau: 13, load: 0.05 },
  { name: "较好", p0: 0.96, tau: 20, load: 0.03 },
];

const WEAK = PROFILES[0];

/** 单个 face-name 对的保持率 */
function retention(delaySec: number, faceCount: number, p: Profile): number {
  const decay = Math.exp(-delaySec / p.tau);
  const load = Math.max(0.15, 1 - p.load * (faceCount - 3));
  return Math.min(0.98, p.p0 * decay * load);
}

/** 单题作答正确率（含未记住时的猜测命中） */
function accuracy(lv: LevelConfig, p: Profile): number {
  const n = lv.faceCount ?? 3;
  const opts = lv.options ?? 3;
  const r = retention((lv.delayMs ?? 0) / 1000, n, p);
  return r + (1 - r) / opts;
}

/**
 * 双约束标定：
 *   ① 上限：不能超过「一般玩家轻松通过（≥85%）」的水平（适老原则）
 *   ② 下限：要明显高于盲猜——纯随机猜也能过，说明这关根本没在考记忆
 * 先取满足 ① 的最大阈值；若它可被盲猜轻易通过（概率 >25%），
 * 则向上抬一档，前提是一般玩家仍能 ≥70% 通过。
 * 另：过关阈值不允许等于 N（全对留给三星），否则「过关」就等同于三星。
 */
function suggestThreshold(n: number, opts: number, pmfTypical: number[]): number {
  const guessPmf = binomialPmf(n, 1 / opts);
  let t = 1;
  for (let k = n; k >= 1; k--) {
    if (passRateFromPmf(pmfTypical, k) >= 0.85) { t = k; break; }
  }
  while (t + 1 <= n
    && passRateFromPmf(guessPmf, t) > 0.25
    && passRateFromPmf(pmfTypical, t + 1) >= 0.70) {
    t++;
  }
  return Math.max(1, Math.min(t, Math.max(1, n - 1)));
}

/** 二项分布概率质量函数 B(n, p)，长度 n+1 */
function binomialPmf(n: number, p: number): number[] {
  const pmf = new Array<number>(n + 1).fill(0);
  if (p <= 0) { pmf[0] = 1; return pmf; }
  if (p >= 1) { pmf[n] = 1; return pmf; }
  pmf[0] = Math.pow(1 - p, n);
  for (let k = 1; k <= n; k++) {
    pmf[k] = pmf[k - 1] * ((n - k + 1) / k) * (p / (1 - p));
  }
  return pmf;
}

/** 最小 k 使累计概率 ≥ q（即 q 分位数） */
function quantileFromPmf(pmf: number[], q: number): number {
  let cum = 0;
  for (let k = 0; k < pmf.length; k++) {
    cum += pmf[k];
    if (cum >= q) return k;
  }
  return pmf.length - 1;
}

/** 达到阈值（正确数 ≥ threshold）的概率 */
function passRateFromPmf(pmf: number[], threshold: number): number {
  return pmf.slice(threshold).reduce((s, v) => s + v, 0);
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

console.log("=== 面孔-名字（face）阈值校准模拟 ===\n");
console.log("记忆模型：r = p0 × exp(-延迟/τ) × (1 - load×(人数-3))；未记住则在选项中盲猜（命中 1/选项）");
console.log("玩家档位：");
for (const p of PROFILES) {
  console.log(`  ${p.name}：p0=${p.p0} τ=${p.tau}s load=${p.load}`);
}
console.log("\n⚠ 参数为文献量级的合理假设，非真实用户数据；本工具用于识别「明显不合理」的阈值。");
console.log("  标定原则：① 一般玩家通过率 ≥85%；② 盲猜通过率 ≤25%；③ 阈值 ≠ 人数（全对留给三星）。\n");

const rows: { id: string; cur: number; suggest: number; changed: boolean }[] = [];

console.log(
  "关卡  人数 延迟 选项 单题正确率(弱/一般/较好) 现阈值 弱p50 弱通过率 一般通过率 盲猜通过率 建议",
);
console.log("-".repeat(108));

for (const lv of GEN_FACE) {
  const n = lv.faceCount ?? 3;
  const cur = lv.passTarget;

  const accs = PROFILES.map((p) => accuracy(lv, p));
  const pmfs = PROFILES.map((p) => binomialPmf(n, accuracy(lv, p)));
  const weakPmf = pmfs[0];

  const q50 = quantileFromPmf(weakPmf, 0.5);
  const weakPass = passRateFromPmf(weakPmf, cur);
  const normalPass = passRateFromPmf(pmfs[1], cur);
  const guessPmf = binomialPmf(n, 1 / (lv.options ?? 3));
  const curGuessPass = passRateFromPmf(guessPmf, cur);

  const suggest = suggestThreshold(n, lv.options ?? 3, pmfs[1]);
  const changed = suggest !== cur;
  rows.push({ id: lv.id, cur, suggest, changed });

  const line = [
    lv.id.padEnd(5),
    String(n).padStart(3),
    `${((lv.delayMs ?? 0) / 1000).toFixed(1)}s`.padStart(5),
    String(lv.options ?? 3).padStart(4),
    `  ${accs.map((a) => pct(a).padStart(4)).join(" /")}`,
    `   ${String(cur).padStart(3)}`,
    `   ${String(q50).padStart(3)}`,
    `  ${pct(weakPass).padStart(6)}`,
    `   ${pct(normalPass).padStart(6)}`,
    `   ${pct(curGuessPass).padStart(6)}`,
    `  ${String(suggest).padStart(3)}${changed ? " ←改" : ""}`,
  ].join("");
  console.log(line);
}

console.log("\n=== 建议回写（LevelGen.FACE_SPECS 的 pass 字段）===");
for (const r of rows) {
  if (r.changed) {
    console.log(`  ${r.id}: ${r.cur} → ${r.suggest}`);
  }
}
if (!rows.some((r) => r.changed)) {
  console.log("  无需调整：现阈值与标定结果一致。");
}

// 附加诊断：任何要求「全对」的场景都值得警惕
const risky = rows.filter((r) => {
  const lv = GEN_FACE.find((l) => l.id === r.id)!;
  return r.cur >= (lv.faceCount ?? 3);
});
if (risky.length > 0) {
  console.log("\n⚠ 以下关卡当前要求「全部答对」才能过关，对偏弱玩家过于严苛：");
  for (const r of risky) console.log(`  ${r.id} 要求 ${r.cur} 题全对`);
}
