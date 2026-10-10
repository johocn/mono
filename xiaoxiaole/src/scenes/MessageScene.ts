/**
 * MessageScene — 留言建议页
 *
 * 纯 Canvas 无法输入中文（没有输入焦点、唤不起中文键盘），因此沿用 SkinScene 的思路：
 * 用一个 DOM 浮层承载真正的 <input> / <textarea>，Canvas 只负责展示与按钮。
 * 浮层做成大字号（适老化），填完点「完成」即可回到画布继续操作。
 *
 * 提交走 zhao-website 的 lead 接口（后台「线索/留资」），匿名可提交。
 * 只收「昵称 + 内容」两项，昵称可不填——降低长辈填写负担，也避免收集联系方式的隐私风险。
 */

import { gameCanvas } from "../ui/GameCanvas";
import { audioSynth } from "../ui/AudioSynth";
import { NAV_H } from "../ui/SceneChrome";
import { wrapText } from "../ui/ResultCard";
import { submitMessage } from "../core/CommunityApi";

interface Rect { x: number; y: number; w: number; h: number }

export interface MessageCallbacks {
  onBack(): void;
}

const MAX_LEN = 300;

export class MessageScene {
  private cb: MessageCallbacks;
  private backRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private nameRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private contentRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private submitRect: Rect = { x: 0, y: 0, w: 0, h: 0 };

  private nickname = "";
  private content = "";
  private sending = false;
  private toastUntil = 0;
  private toastText = "";

  /** DOM 输入浮层（懒创建，销毁时移除，避免跨场景泄漏） */
  private editor: HTMLDivElement | null = null;
  private nameInput: HTMLInputElement | null = null;
  private contentInput: HTMLTextAreaElement | null = null;
  private editing: "name" | "content" | null = null;

  constructor(cb: MessageCallbacks) {
    this.cb = cb;
    gameCanvas.setTouchHandler((x, y) => this.onTouch(x, y));
    gameCanvas.setUpdateCallback(() => this.render());
  }

  private hit(r: Rect, x: number, y: number): boolean {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  private onTouch(x: number, y: number): void {
    // 浮层打开时由 DOM 自己接管输入，画布不再响应
    if (this.editing) return;

    if (this.hit(this.backRect, x, y)) {
      audioSynth.playUi("button");
      this.cb.onBack();
      return;
    }
    if (this.hit(this.nameRect, x, y)) {
      audioSynth.playUi("button");
      this.openEditor("name");
      return;
    }
    if (this.hit(this.contentRect, x, y)) {
      audioSynth.playUi("button");
      this.openEditor("content");
      return;
    }
    if (this.hit(this.submitRect, x, y)) {
      audioSynth.playUi("button");
      void this.submit();
      return;
    }
  }

  /** 打开 DOM 输入浮层并聚焦对应字段 */
  private openEditor(focus: "name" | "content"): void {
    this.ensureEditor();
    if (this.nameInput) this.nameInput.value = this.nickname;
    if (this.contentInput) this.contentInput.value = this.content;
    this.editing = focus;
    if (this.editor) this.editor.style.display = "block";
    // 延迟聚焦，确保元素已可见（部分移动端浏览器要求）
    setTimeout(() => {
      if (focus === "name") this.nameInput?.focus();
      else this.contentInput?.focus();
    }, 30);
  }

  /** 收起浮层并把内容同步回画布状态 */
  private closeEditor(): void {
    if (this.nameInput) this.nickname = this.nameInput.value.slice(0, 20);
    if (this.contentInput) this.content = this.contentInput.value.slice(0, MAX_LEN);
    this.editing = null;
    if (this.editor) this.editor.style.display = "none";
  }

  private ensureEditor(): void {
    if (this.editor) return;

    const box = document.createElement("div");
    // 大字号 + 大按钮，贴合适老化；z-index 高于画布
    box.style.cssText = [
      "position:fixed", "left:0", "right:0", "bottom:0", "z-index:9998",
      "background:#FFFDF8", "padding:16px", "box-sizing:border-box",
      "box-shadow:0 -6px 24px rgba(0,0,0,0.25)", "border-radius:16px 16px 0 0",
      "font-family:'Microsoft YaHei','Noto Sans CJK SC',sans-serif", "display:none",
    ].join(";");

    const mkLabel = (text: string): HTMLLabelElement => {
      const l = document.createElement("label");
      l.textContent = text;
      l.style.cssText = "display:block;font-size:18px;font-weight:700;color:#2A2A33;margin:6px 0 8px";
      return l;
    };

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.placeholder = "比如：李阿姨（不填也行）";
    nameInput.maxLength = 20;
    nameInput.style.cssText = fieldCss();

    const contentInput = document.createElement("textarea");
    contentInput.placeholder = "哪里玩着不顺手？想加什么玩法？尽管告诉我们～";
    contentInput.maxLength = MAX_LEN;
    contentInput.style.cssText = fieldCss() + ";height:120px;resize:none;line-height:1.5";

    const doneBtn = document.createElement("button");
    doneBtn.type = "button"; // 避免触发表单提交
    doneBtn.textContent = "完成";
    doneBtn.style.cssText = [
      "display:block;width:100%;height:54px;margin-top:14px;border:none;border-radius:14px",
      "background:#07C160;color:#fff;font-size:20px;font-weight:700",
    ].join(";");
    doneBtn.addEventListener("click", () => {
      audioSynth.playUi("button");
      this.closeEditor();
    });

    box.appendChild(mkLabel("您的称呼"));
    box.appendChild(nameInput);
    box.appendChild(mkLabel("想说的话"));
    box.appendChild(contentInput);
    box.appendChild(doneBtn);
    document.body.appendChild(box);

    this.editor = box;
    this.nameInput = nameInput;
    this.contentInput = contentInput;
  }

  private async submit(): Promise<void> {
    if (this.sending) return;
    const text = this.content.trim();
    if (!text) {
      this.showToast("请先写点什么再提交哦");
      return;
    }
    this.sending = true;
    const ok = await submitMessage(this.nickname, text);
    this.sending = false;
    if (ok) {
      this.content = "";
      if (this.contentInput) this.contentInput.value = "";
      this.showToast("收到啦，谢谢您的建议！");
    } else {
      // 失败也要温和：不吓唬长辈，同时说明可以稍后再试
      this.showToast("暂时没发出去，内容已留着，稍后再试");
    }
  }

  private showToast(text: string): void {
    this.toastText = text;
    this.toastUntil = performance.now() + 2600;
  }

  private render(): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();

    gameCanvas.draw((ctx) => {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#1a1a2e");
      grad.addColorStop(0.5, "#16213e");
      grad.addColorStop(1, "#0f3460");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }, 0);

    this.backRect = { x: 14, y: 20, w: 52, h: 52 };
    gameCanvas.drawRoundRect(this.backRect.x, this.backRect.y, 52, 52, 12, "rgba(255,255,255,0.10)", 5);
    gameCanvas.drawText("‹", this.backRect.x + 26, this.backRect.y + 24,
      { size: 34, color: "#cdd5f0", bold: true }, 6);

    gameCanvas.drawText("说说您的想法", w / 2, 44, { size: 26, color: "#FFE66D", bold: true }, 6);
    gameCanvas.drawText("哪里不好玩、想加什么，都可以告诉我们", w / 2, 72,
      { size: 13, color: "#9aa3c8" }, 6);

    const boxX = 24;
    const boxW = w - 48;

    // 昵称
    this.nameRect = { x: boxX, y: 100, w: boxW, h: 60 };
    this.drawField(this.nameRect, "您的称呼", this.nickname, "可不填", false);

    // 内容
    this.contentRect = { x: boxX, y: 172, w: boxW, h: 150 };
    this.drawField(this.contentRect, "想说的话", this.content, "点这里开始写", true);

    // 字数
    gameCanvas.drawText(`${this.content.length} / ${MAX_LEN}`, boxX + boxW - 8, 332,
      { size: 12, color: "#6f7899", align: "right" }, 6);

    // 提交
    this.submitRect = { x: boxX, y: 348, w: boxW, h: 56 };
    gameCanvas.draw((ctx) => {
      const g = ctx.createLinearGradient(boxX, this.submitRect.y, boxX, this.submitRect.y + 56);
      g.addColorStop(0, "#07C160");
      g.addColorStop(1, "#06a050");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(boxX, this.submitRect.y, boxW, 56, 16);
      ctx.fill();
    }, 5);
    gameCanvas.drawText(this.sending ? "正在发送…" : "📮 提交建议", w / 2, this.submitRect.y + 28,
      { size: 20, color: "#fff", bold: true }, 6);

    gameCanvas.drawText("留言是匿名的，我们只用来改进游戏", w / 2, 424,
      { size: 12, color: "#6f7899" }, 6);

    if (performance.now() < this.toastUntil && this.toastText) {
      const tw = Math.min(w - 48, this.toastText.length * 14 + 40);
      const tx = (w - tw) / 2;
      const ty = h - NAV_H - 60;
      gameCanvas.draw((ctx) => {
        ctx.fillStyle = "rgba(0,0,0,0.88)";
        ctx.beginPath();
        ctx.roundRect(tx, ty, tw, 34, 10);
        ctx.fill();
      }, 60);
      gameCanvas.drawText(this.toastText, w / 2, ty + 17, { size: 13, color: "#fff" }, 61);
    }
  }

  /** 画一个「看起来像输入框」的区域（真正输入在 DOM 浮层里完成） */
  private drawField(r: Rect, label: string, value: string, placeholder: string, multiline: boolean): void {
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, 14);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }, 5);
    gameCanvas.drawText(label, r.x + 16, r.y + 20,
      { size: 14, color: "#9aa3c8", align: "left" }, 6);

    if (value) {
      if (multiline) {
        const lines = wrapText(value, 18, 4);
        lines.forEach((ln, i) => {
          gameCanvas.drawText(ln, r.x + 16, r.y + 48 + i * 24,
            { size: 16, color: "#e6ebff", align: "left" }, 6);
        });
      } else {
        gameCanvas.drawText(value, r.x + 16, r.y + 48,
          { size: 17, color: "#e6ebff", align: "left" }, 6);
      }
    } else {
      gameCanvas.drawText(placeholder, r.x + 16, r.y + 48,
        { size: 15, color: "#6f7899", align: "left" }, 6);
    }
  }

  destroy(): void {
    // 关键：移除 DOM 浮层，否则切场景后会一直挂在页面上
    if (this.editor && this.editor.parentNode) this.editor.parentNode.removeChild(this.editor);
    this.editor = null;
    this.nameInput = null;
    this.contentInput = null;
    this.editing = null;
    gameCanvas.clearHandlers();
    gameCanvas.setUpdateCallback(null);
  }
}

function fieldCss(): string {
  return [
    "display:block;width:100%;box-sizing:border-box;height:54px",
    "padding:12px 14px;border:2px solid #d8d8e0;border-radius:14px",
    "background:#fff;color:#2A2A33;font-size:20px",
    "font-family:'Microsoft YaHei','Noto Sans CJK SC',sans-serif",
  ].join(";");
}
