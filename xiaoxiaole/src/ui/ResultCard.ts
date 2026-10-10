/**
 * ResultCard — 通关结算卡片共享渲染工具
 *
 * 用于三个模式场景的 in-level 通关结算浮层：
 * - 全屏半透明遮罩（固定，不闪烁）
 * - 居中金色边框卡片
 * - 标题 + 核心成绩 + 事实赞美 + 鼓励 + 统计行
 *
 * 修复要点：文字在调用方生成一次后传入，不在 render 内每帧随机 → 消除闪烁
 */

import { gameCanvas } from "./GameCanvas";
import type { PraiseResult } from "../config/GameText";

/**
 * 中文按字符数自动换行
 * @param maxChars 每行最大字符数
 * @param maxLines 最多行数，超出部分截断并加省略号
 */
/** 中文排版禁则：这些字符不能出现在行首 */
const NO_LINE_START = "！？。，、；：）］｝」』】》〉”’%…·℃";
/** 这些字符不能出现在行尾 */
const NO_LINE_END = "（［｛「『【《〈“‘";

export function wrapText(text: string, maxChars: number, maxLines: number = 0): string[] {
  const lines: string[] = [];
  let current = "";

  for (const ch of text) {
    // 需要换行时，若下一个字符属于「不能行首」集合，则让它跟随本行（允许超 1 字）
    if (current.length >= maxChars && !NO_LINE_START.includes(ch)) {
      let carry = "";
      const last = current[current.length - 1];
      if (NO_LINE_END.includes(last)) {
        current = current.slice(0, -1);
        carry = last;
      }
      lines.push(current);
      current = carry;
    }
    current += ch;
  }
  if (current) lines.push(current);
  if (lines.length === 0) lines.push(text);

  if (maxLines > 0 && lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].slice(0, Math.max(1, maxChars - 1)) + "…";
    return kept;
  }
  return lines;
}

/**
 * 绘制通关结算卡片
 *
 * @param praise     事实赞美结果（headline / encouragement / highlight）
 * @param passed     是否过关
 * @param statsLine  底部统计行（如 "正确 7/8 · 步数 5/12"）
 * @param fadeIn     淡入进度 0..1（1 = 完全显示）
 */
export function drawResultCard(
  praise: PraiseResult,
  passed: boolean,
  statsLine: string,
  fadeIn: number = 1,
): void {
  const w = gameCanvas.getW();
  const h = gameCanvas.getH();

  const a = Math.max(0, Math.min(1, fadeIn));

  // 先换行再定卡片高度：避免长文案（连击多、超额多时）溢出卡片
  const headlineLines = wrapText(praise.headline, 18, 3);
  const encLines = wrapText(praise.encouragement, 20, 3);
  const bodyH = headlineLines.length * 26 + 8 + encLines.length * 23;
  const cardH = Math.min(h - 80, 165 + bodyH);

  // === 全屏遮罩 ===
  gameCanvas.drawRoundRect(0, 0, w, h, 0, `rgba(0,0,0,${0.78 * a})`, 50);

  // === 居中卡片 ===
  const cardW = Math.min(w - 48, 380);
  const cardX = (w - cardW) / 2;
  const cardY = (h - cardH) / 2 - 10;

  // 卡片背景渐变 + 金色边框
  gameCanvas.draw((ctx) => {
    ctx.globalAlpha = a;
    const grad = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH);
    if (passed) {
      grad.addColorStop(0, "#162d35");
      grad.addColorStop(1, "#0c1a22");
    } else {
      grad.addColorStop(0, "#2d1618");
      grad.addColorStop(1, "#1a0f10");
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, 18);
    ctx.fill();

    // 金色边框
    ctx.strokeStyle = passed ? "#FFE66D" : "#A8E6CF";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }, 51);

  // === 标题 ===
  const titleAlpha = passed
    ? `rgba(255,230,109,${a})`
    : `rgba(168,230,207,${a})`;
  gameCanvas.drawText(passed ? "过关！" : "再接再厉", w / 2, cardY + 42,
    { size: 38, color: titleAlpha, bold: true }, 52);

  // === 核心成绩摘要 ===
  gameCanvas.drawText(praise.highlight, w / 2, cardY + 78,
    { size: 22, color: `rgba(255,255,255,${a})` }, 52);

  // === 分隔线 ===
  gameCanvas.draw((ctx) => {
    ctx.globalAlpha = a * 0.3;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cardX + 30, cardY + 100);
    ctx.lineTo(cardX + cardW - 30, cardY + 100);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }, 52);

  // === 事实赞美 headline（青色） ===
  const headlineColor = `rgba(78,205,196,${a})`;
  let textY = cardY + 125;
  for (const line of headlineLines) {
    gameCanvas.drawText(line, w / 2, textY,
      { size: 17, color: headlineColor, bold: true }, 52);
    textY += 26;
  }

  // === 鼓励继续提高（浅灰） ===
  textY += 8;
  const encColor = `rgba(204,204,204,${a})`;
  for (const line of encLines) {
    gameCanvas.drawText(line, w / 2, textY,
      { size: 15, color: encColor }, 52);
    textY += 23;
  }

  // === 底部统计行 ===
  gameCanvas.drawText(statsLine, w / 2, cardY + cardH - 20,
    { size: 14, color: `rgba(136,136,136,${a})` }, 52);
}
