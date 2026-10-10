/**
 * 引导教程覆盖层 — spec v1.1 第 6 节
 * 首次进入各模式触发手把手演示，首次不可跳过。
 * 现改为「带插图的居中卡片」：每步一个大幅图标 + 正文自动换行 + 小贴士框 + 进度条，
 * 并复用首页同款模式主题色，字大图清、布局舒适（适老化友好）。
 */

import { gameCanvas } from "../ui/GameCanvas";
import { wrapText } from "../ui/ResultCard";
import { audioSynth } from "../ui/AudioSynth";
import { speech } from "../core/speech";
import { safety } from "../core/SafetyManager";
import { COMPANION, companion } from "../ui/Companion";
import { companionBubble } from "../ui/CompanionBubble";
import type { ModeId } from "../config/LevelConfig";

interface Rect { x: number; y: number; w: number; h: number }

interface TutorialStep {
  icon: string;   // 本步配图（emoji 大图标）
  text: string;   // 主说明
  hint: string;   // 小贴士
}

/** 复用首页各模式的主题色与图标，保证整体视觉一致 */
const MODE_META: Record<ModeId, { icon: string; color: string }> = {
  match3: { icon: "🌸", color: "#FF6B9D" },
  audio: { icon: "🎵", color: "#6C5CE7" },
  poetry: { icon: "📜", color: "#9b59b6" },
  corsi: { icon: "🟦", color: "#2E7D8A" },
  face: { icon: "🧑", color: "#E08A3C" },
  memory: { icon: "🃏", color: "#4ECDC4" },
  stroop: { icon: "🎨", color: "#F2784B" },
  money: { icon: "💰", color: "#2FA84F" },
  pm: { icon: "🔔", color: "#8B5CF6" },
  clock: { icon: "🕐", color: "#3E7CB1" },
  nostalgia: { icon: "🎶", color: "#E0679B" },
};

const TUTORIALS: Record<ModeId, TutorialStep[]> = {
  match3: [
    { icon: "👆", text: "点一下棋子，再点旁边的棋子", hint: "也可以直接往相邻方向滑一下" },
    { icon: "✨", text: "三个以上相同棋子连成线即可消除", hint: "一次消掉更多，或者连续消除，分数更高" },
    { icon: "💡", text: "步数有限，卡住了就点下方「提示」", hint: "不着急，慢慢想" },
    { icon: "🐟", text: "连成 4 个会生成小鱼🐟：消除时它额外清掉一片", hint: "有些关卡还有果冻🍮，要全部清掉才能过关" },
    { icon: "🧊", text: "遇到冰块🧊/锁链🔗/黑洞🕳️等障碍，先消旁边的棋子破解", hint: "点一下障碍格会有对应提示" },
  ],
  audio: [
    { icon: "🔊", text: "仔细听播放的声音", hint: "声音来自花园中的某个事物" },
    { icon: "🐦", text: "在下方图标中点击对应的那个", hint: "鸟鸣、水流、风铃各有特色" },
    { icon: "🔁", text: "听不清可以点重听按钮", hint: "慢慢来，不着急" },
    { icon: "🤫", text: "有些关卡夹着干扰音🤫，听不清就多点几次「重听」", hint: "序列题要按播放顺序，一个一个对应点" },
  ],
  poetry: [
    { icon: "📜", text: "点击一个上句方块，再点它的下句", hint: "例如「床前」配「明月光」" },
    { icon: "🔗", text: "两个方块之间要能连上线", hint: "连线最多拐两个弯" },
    { icon: "⚠️", text: "配对错了也会用掉一步", hint: "不确定的时候可以点「偷看」" },
    { icon: "💡", text: "对联来自古诗，先想意境更好配", hint: "连线绕不开时，点「重排」换个布局" },
  ],
  corsi: [
    { icon: "🔆", text: "方块会依次亮起，还伴随不同的音高", hint: "记住亮起的顺序和声音" },
    { icon: "👆", text: "亮完之后，按相同顺序把方块点回来", hint: "点错也没关系，会再给你看一次" },
    { icon: "🎉", text: "全部点对就进入下一轮，多练记性越来越好", hint: "不着急，慢慢来" },
  ],
  face: [
    { icon: "👤", text: "先看好每张面孔和下面的名字", hint: "把脸和名字在脑子里连在一起" },
    { icon: "🧠", text: "记住后稍等片刻，再凭面孔选出正确名字", hint: "间隔越久越练长时记忆" },
    { icon: "✅", text: "点错也没关系，会告诉你正确答案", hint: "多认几次，老邻居就都熟了" },
  ],
  memory: [
    { icon: "🃏", text: "点开两张牌，把它们翻开看看", hint: "一对 = 画面卡配对应的名字卡" },
    { icon: "💞", text: "配成一对就消除，不是一对会合上", hint: "合上前尽量记住它们的位置" },
    { icon: "⏱️", text: "后面的关卡停留时间越来越短", hint: "配好的牌会一直留在面上，方便回忆" },
  ],
  stroop: [
    { icon: "🔤", text: "中间会显示一个颜色词，比如「红」", hint: "但这个字可能用别的颜色写" },
    { icon: "🎨", text: "默认点字的【颜色】，不是字的意思", hint: "只看颜色，别被字带着走" },
    { icon: "🔄", text: "后面的关卡会反过来，点【字的意思】", hint: "每关开头都有规则横幅，看清再答" },
  ],
  money: [
    { icon: "🍜", text: "看清每样菜的价钱", hint: "题目会问「一共多少」或「应找多少」" },
    { icon: "💴", text: "在下面的金额里点一个就行", hint: "不用打字，慢慢算也没关系" },
    { icon: "🧮", text: "后面的关卡东西更多、还有零头", hint: "先算整元，再算角分，会轻松些" },
  ],
  pm: [
    { icon: "🔔", text: "先记住任务：看到 🐟 鲜鱼就按 🔔", hint: "就像记得关火一样，是「待会儿要做的事」" },
    { icon: "📦", text: "其它物品点它属于哪一类就行", hint: "虾、鸡肉长得像，但看到它们不要按铃" },
    { icon: "🧠", text: "后面的关卡提醒会越来越少", hint: "全靠自己记住，才是练记性" },
  ],
  clock: [
    { icon: "🕐", text: "看清钟面上的指针", hint: "短针看几点，长针看几分" },
    { icon: "⏰", text: "在下面点出正确的时间", hint: "不用打字，点一下就行" },
    { icon: "🔄", text: "后面会反过来：给时间，选钟面", hint: "有的钟面没有数字，看刻度也一样能读" },
  ],
  nostalgia: [
    { icon: "🎶", text: "屏幕会给出一句老歌的歌词", hint: "或者反过来：给出歌名，要你找歌词" },
    { icon: "🎤", text: "在下面几个选项里点出对应的歌名/歌词", hint: "都是咱们年轻时熟悉的调调" },
    { icon: "💡", text: "想不起点一下「提示」，会再给你看一遍", hint: "慢慢回忆，想起一段是一段" },
  ],
};

/** 把主题色往白色方向提亮，用于渐变高光 */
function tint(hex: string, white: number): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  const nr = Math.round(r + (255 - r) * white);
  const ng = Math.round(g + (255 - g) * white);
  const nb = Math.round(b + (255 - b) * white);
  return `rgb(${nr},${ng},${nb})`;
}

export class TutorialOverlay {
  private steps: TutorialStep[];
  private currentStep = 0;
  private onComplete: () => void;
  private btnRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private modeIcon: string;
  private color: string;
  private lastSpokenStep: number = -1;
  /** 气泡已展示到的步骤（避免每帧 show 导致重复朗读） */
  private lastShownStep: number = -1;
  /** 朗读预计结束时刻，到点让小园「闭嘴」 */
  private speakUntil: number = 0;

  constructor(mode: ModeId, onComplete: () => void) {
    this.steps = TUTORIALS[mode];
    this.onComplete = onComplete;
    const meta = MODE_META[mode];
    this.modeIcon = meta?.icon ?? "🧠";
    this.color = meta?.color ?? "#4ECDC4";
    gameCanvas.setTouchHandler((x, y) => this.onTouch(x, y));
    gameCanvas.setUpdateCallback(() => this.render());
  }

  private hit(r: Rect, x: number, y: number): boolean {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  private onTouch(x: number, y: number): void {
    // 点小园：把当前这句话再读一遍（长辈没听清时很有用）
    if (companionBubble.hit(x, y)) {
      audioSynth.playUi("button");
      companionBubble.replay();
      return;
    }
    if (!this.hit(this.btnRect, x, y)) return;
    audioSynth.playUi("button");
    this.currentStep++;
    if (this.currentStep >= this.steps.length) {
      gameCanvas.setTouchHandler(null);
      gameCanvas.setUpdateCallback(null);
      this.onComplete();
    }
  }

  private render(): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();
    const color = this.color;

    // 背景遮罩 + 主题色柔光
    gameCanvas.drawRoundRect(0, 0, w, h, 0, "rgba(16,20,38,0.74)", 1);
    gameCanvas.draw((ctx) => {
      const g = ctx.createRadialGradient(w / 2, h * 0.42, 20, w / 2, h * 0.42, Math.max(w, h) * 0.6);
      g.addColorStop(0, color + "33");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }, 1);

    // 卡片
    const cw = Math.min(w - 48, 440);
    const ch = Math.min(h - 56, 560);
    const cx = (w - cw) / 2;
    const cy = (h - ch) / 2;
    const p = 22;

    gameCanvas.drawRoundRect(cx + 3, cy + 6, cw, ch, 28, "rgba(0,0,0,0.28)", 2);
    gameCanvas.drawRoundRect(cx, cy, cw, ch, 28, "#FFFDF8", 3);

    // 顶部：模式图标 + 标题 + 步数
    const badgeR = 16;
    gameCanvas.drawCircle(cx + p + badgeR, cy + 30, badgeR, color, 10);
    gameCanvas.drawText(this.modeIcon, cx + p + badgeR, cy + 30, { size: 20 }, 11);
    gameCanvas.drawText("新人指引", cx + p + badgeR * 2 + 12, cy + 30,
      { size: 18, color: "#2A2A33", bold: true, align: "left" }, 11);
    const len = this.steps.length;
    const cur = this.currentStep;
    gameCanvas.drawText(`第 ${cur + 1} / ${len} 步`, cx + cw - p, cy + 30,
      { size: 14, color: "#8A8A99", align: "right" }, 11);

    // 进度条
    const trackY = cy + 56;
    const trackX = cx + p;
    const trackW = cw - p * 2;
    gameCanvas.drawRoundRect(trackX, trackY, trackW, 6, 3, "#ECECF1", 10);
    const fillW = Math.max(12, (trackW * (cur + 1)) / len);
    gameCanvas.drawRoundRect(trackX, trackY, fillW, 6, 3, color, 11);

    // 插图徽章（大幅 emoji 图标）
    const r = Math.max(40, Math.min(54, ch * 0.13));
    const bx = cx + cw / 2;
    const by = cy + 122;
    gameCanvas.drawCircle(bx, by + 5, r, "rgba(0,0,0,0.10)", 12);
    gameCanvas.draw((ctx) => {
      const g = ctx.createLinearGradient(bx, by - r, bx, by + r);
      g.addColorStop(0, tint(color, 0.55));
      g.addColorStop(1, color);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.fill();
    }, 13);
    const step = this.steps[cur];
    // 每切换一步朗读一次（受 声音/语音 开关控制，避免每帧重复）
    if (this.lastSpokenStep !== cur) {
      this.lastSpokenStep = cur;
      // 第一步由向导「小园」轻声开场，之后读每步说明
      this.speakStep(cur === 0 ? COMPANION.welcome : `${step.text}。${step.hint}`);
    }
    gameCanvas.drawText(step.icon, bx, by, { size: Math.round(r * 0.95) }, 14);

    // 正文（自动换行，避免溢出）
    const textLines = wrapText(step.text, 17, 3);
    const textLH = 30;
    let ty = by + r + 26;
    textLines.forEach((ln, i) => {
      gameCanvas.drawText(ln, cx + cw / 2, ty + i * textLH,
        { size: 22, color: "#2A2A33", bold: true }, 15);
    });
    ty += textLines.length * textLH;

    // 小贴士框
    const hintLines = wrapText(step.hint, 20, 3);
    const hintLH = 24;
    const hintBoxH = 16 + hintLines.length * hintLH + 14;
    const hintBoxY = ty + 8;
    gameCanvas.drawRoundRect(cx + p, hintBoxY, cw - p * 2, hintBoxH, 14, color + "12", 12);
    gameCanvas.drawRoundRect(cx + p, hintBoxY, 5, hintBoxH, 2, color, 12);
    gameCanvas.drawText("💡", cx + p + 14, hintBoxY + 22, { size: 18 }, 13);
    hintLines.forEach((ln, i) => {
      gameCanvas.drawText(ln, cx + p + 40, hintBoxY + 22 + i * hintLH,
        { size: 15, color: "#5A5A66", align: "left" }, 13);
    });

    // 底部按钮
    const bh = 52;
    const btnY = cy + ch - p - bh;
    const bw = cw - p * 2;
    this.btnRect = { x: cx + p, y: btnY, w: bw, h: bh };
    const isLast = cur === len - 1;
    gameCanvas.draw((ctx) => {
      const g = ctx.createLinearGradient(cx + p, btnY, cx + p, btnY + bh);
      g.addColorStop(0, tint(color, 0.30));
      g.addColorStop(1, color);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(cx + p, btnY, bw, bh, 16);
      ctx.fill();
    }, 20);
    gameCanvas.drawText(isLast ? "开始游戏" : "下一步", cx + cw / 2, btnY + bh / 2,
      { size: 22, color: "#ffffff", bold: true }, 21);

    // 温情向导「小园」：落在卡片外的空档里陪伴
    this.drawCompanion(w, h, cy, cy + ch, cur);
  }

  /**
   * 陪伴气泡：只在卡片外有足够空档时出现，绝不遮挡「下一步」按钮。
   * 屏幕过矮（上下空档均不足）时优雅降级——不显示，保证按钮始终可见可点。
   */
  private drawCompanion(w: number, h: number, cardTop: number, cardBottom: number, cur: number): void {
    const now = performance.now();
    if (this.speakUntil && now > this.speakUntil) {
      this.speakUntil = 0;
      companion.setSpeaking(false);
    }

    const gapBelow = h - 8 - (cardBottom + 8);
    const gapAbove = cardTop - 8 - 8;
    const gap = Math.max(gapBelow, gapAbove);
    if (gap < 64) {
      companionBubble.hide();
      return;
    }

    const avatar = Math.max(36, Math.min(56, gap - 2));
    if (this.lastShownStep !== cur) {
      this.lastShownStep = cur;
      companionBubble.show({
        text: cur === 0 ? COMPANION.welcome : companion.say("encourage"),
        mood: cur === 0 ? "smile" : "encourage",
        x: 12,
        y: gapBelow >= gapAbove ? h - 8 - avatar : 8,
        maxWidth: Math.min(w - 24, 420),
        interactive: true, // 气泡落在卡片外，不会遮挡「下一步」
        speak: false, // 正文由 speakStep 朗读，避免与步骤说明抢话
      });
    }
    companionBubble.update(now);
    companionBubble.draw();
  }

  /** 朗读一句，同时让小园「张嘴」，到点自动闭嘴（不新开定时器，避免场景销毁后残留） */
  private speakStep(text: string): void {
    if (!safety.isSoundEnabled() || !safety.isSpeechEnabled()) return;
    const rate = safety.getSpeechRate();
    speech.speak(text, { rate });
    companion.setSpeaking(true);
    this.speakUntil = performance.now() + 500 + (text.length * 210) / Math.max(0.6, rate);
  }

  destroy(): void {
    speech.stop();
    companionBubble.hide();
    gameCanvas.clearHandlers();
    gameCanvas.setUpdateCallback(null);
  }
}
