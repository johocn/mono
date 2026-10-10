/**
 * SkinScene — 换装花园（皮肤中心）
 *
 * 三个标签：
 * - **我的皮肤**：本地皮肤库（IndexedDB）+ 内置默认 + 云端作品（带审核状态徽标），可预览 / 应用 / 赠送 / 删除 / 导出分享码
 * - **模板中心**：云端已上架皮肤，可用积分兑换（后端未配置时给出降级提示，不阻塞本地功能）
 * - **AI 做图**：复制平台提示词 → 到外部 AI 工具自行做图 → 上传素材 → 发布送审（通过后上架可交易）
 *
 * 适老化：热区 ≥44px、大字号高对比、动效克制；导入皮肤必过对比度校验。
 */

import { gameCanvas } from "../ui/GameCanvas";
import { NAV_H } from "../ui/SceneChrome";
import { audioSynth } from "../ui/AudioSynth";
import { progress } from "../core/ProgressStore";
import { skinManager } from "../core/SkinManager";
import {
  skinStore,
  unlockSkin,
  isUnlocked,
  encodeShareCode,
  decodeShareCode,
} from "../core/SkinStore";
import { skinApi, type MarketSkin, type PromptTemplate } from "../core/SkinApi";
import { authStore } from "../core/AuthStore";
import {
  DEFAULT_SKIN,
  checkSkinContrast,
  checkImageSize,
  MAX_SKIN_IMAGE_BYTES,
  type SkinConfig,
} from "../core/Skin";

interface Rect { x: number; y: number; w: number; h: number }

type Tab = "mine" | "market" | "ai";

const TILE_PREVIEW: string[] = ["flower", "leaf", "fruit", "butterfly", "bird"];

export class SkinScene {
  private onBack: () => void;

  private tab: Tab = "mine";
  private backRect: Rect = { x: 14, y: 16, w: 52, h: 52 };
  private loginRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private tabRects: Rect[] = [];
  private cardRects: { rect: Rect; skin: SkinConfig; market?: MarketSkin }[] = [];
  private actionRects: { key: string; rect: Rect }[] = [];
  private templateRects: { rect: Rect; tpl: PromptTemplate }[] = [];
  private deleteRects: { rect: Rect; skin: SkinConfig }[] = [];

  private mine: SkinConfig[] = [];
  private market: MarketSkin[] = [];
  private templates: PromptTemplate[] = [];
  private specText = "";
  private selectedTpl = 0;
  /** 云端作品状态：key=皮肤 id（=skinId），用于「我的皮肤」审核徽标 */
  private cloudStatus = new Map<string, { status: number; reviewNote: string | null }>();
  private copyRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private uploadRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private fileInput: HTMLInputElement | null = null;

  private selected: SkinConfig = skinManager.getSkin();
  private toastText = "";
  private toastErr = false;
  private toastUntil = 0;
  private loading = false;
  private lastTime = performance.now();

  constructor(onBack: () => void) {
    this.onBack = onBack;
    gameCanvas.setTouchHandler((x, y) => this.onTouch(x, y));
    gameCanvas.setUpdateCallback(() => this.update(performance.now()));
    this.load();
  }

  private async load(): Promise<void> {
    this.mine = await skinStore.list();
    this.cloudStatus.clear();
    // 已登录时合并云端「我的皮肤」（去重，云端补充本地没有的），并记录审核状态
    if (skinApi.available()) {
      const res = await skinApi.listMine();
      if (res.ok && res.data) {
        const known = new Set(this.mine.map((s) => s.id));
        for (const m of res.data) {
          if (!m.config) continue;
          this.cloudStatus.set(m.skinId, { status: m.status ?? 1, reviewNote: m.reviewNote ?? null });
          if (!known.has(m.config.id)) this.mine.push(m.config);
        }
      }
    }
    // 已登录时以服务端余额为准（避免本地与服务端双写漂移）
    if (skinApi.available()) {
      const pts = await skinApi.getPoints();
      if (pts.ok && pts.data && typeof pts.data.balance === "number") {
        progress.setPoints(pts.data.balance);
      }
    }
    if (skinApi.backendConfigured()) {
      const tpl = await skinApi.promptTemplates();
      if (tpl.ok && tpl.data) {
        this.templates = tpl.data.items;
        this.specText = tpl.data.spec?.specText ?? "";
      }
      const mk = await skinApi.listMarket();
      if (mk.ok && mk.data) this.market = mk.data;
    }
  }

  private update(now: number): void {
    this.lastTime = now;
    this.render();
  }

  private hit(r: Rect, x: number, y: number): boolean {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  private showToast(text: string, isErr = false): void {
    this.toastText = text;
    this.toastErr = isErr;
    this.toastUntil = performance.now() + 2600;
  }

  // === 交互 ===

  private onTouch(x: number, y: number): void {
    if (this.hit(this.backRect, x, y)) {
      audioSynth.playUi("button");
      this.onBack();
      return;
    }
    if (this.hit(this.loginRect, x, y) && this.loginRect.w > 0) {
      audioSynth.playUi("button");
      this.doGuestLogin();
      return;
    }

    for (let i = 0; i < this.tabRects.length; i++) {
      if (this.hit(this.tabRects[i], x, y)) {
        audioSynth.playUi("button");
        this.tab = i === 0 ? "mine" : i === 1 ? "market" : "ai";
        return;
      }
    }

    for (const c of this.cardRects) {
      if (this.hit(c.rect, x, y)) {
        audioSynth.playUi("button");
        this.selected = c.skin;
        if (c.market) this.redeem(c.market);
        return;
      }
    }

    // 删除角标优先于卡片选中（角标在卡片右上角，先判定避免误选）
    for (const d of this.deleteRects) {
      if (this.hit(d.rect, x, y)) {
        audioSynth.playUi("button");
        void this.removeSkin(d.skin);
        return;
      }
    }

    for (const t of this.templateRects) {
      if (this.hit(t.rect, x, y)) {
        audioSynth.playUi("button");
        this.selectedTpl = this.templateRects.indexOf(t);
        return;
      }
    }
    if (this.tab === "ai") {
      if (this.hit(this.copyRect, x, y)) { audioSynth.playUi("button"); this.copyPrompt(); return; }
      if (this.hit(this.uploadRect, x, y)) { audioSynth.playUi("button"); this.openUpload(); return; }
    }

    for (const a of this.actionRects) {
      if (this.hit(a.rect, x, y)) {
        audioSynth.playUi("button");
        this.onAction(a.key);
        return;
      }
    }
  }

  private onAction(key: string): void {
    switch (key) {
      case "apply":
        skinManager.apply(this.selected);
        this.showToast(`已应用「${this.selected.name}」`);
        break;
      case "default":
        skinManager.reset();
        this.selected = DEFAULT_SKIN;
        this.showToast("已恢复默认皮肤");
        break;
      case "export":
        this.exportShare();
        break;
      case "import":
        this.importShare();
        break;
      case "publish":
        void this.publishSelected();
        break;
      case "gift":
        void this.giftSelected();
        break;
    }
  }

  /** 发布当前选中皮肤到模板中心（贴图必须已是服务器地址，不能是本地 dataURL） */
  private async publishSelected(): Promise<void> {
    if (!skinApi.available()) {
      this.showToast("请先登录后再发布", true);
      return;
    }
    if (this.selected.id === DEFAULT_SKIN.id) {
      this.showToast("默认皮肤无需发布", true);
      return;
    }
    if (this.hasLocalDataImage(this.selected)) {
      this.showToast("贴图仍为本地数据，请先登录后上传素材再发布", true);
      return;
    }
    const c = checkSkinContrast(this.selected);
    if (!c.ok) {
      this.showToast(`对比度 ${c.ratio.toFixed(2)}:1 不达标，无法发布`, true);
      return;
    }
    this.loading = true;
    const res = await skinApi.publish(this.selected);
    this.loading = false;
    this.showToast(
      res.ok ? `「${this.selected.name}」已提交审核，通过后上架模板中心` : (res.error || "发布失败"),
      !res.ok,
    );
    if (res.ok) void this.load();
  }

  /** 赠送当前选中的皮肤给好友（输入对方登录账号名，不限次） */
  private async giftSelected(): Promise<void> {
    if (!skinApi.available()) {
      this.showToast("请先登录后再赠送", true);
      return;
    }
    if (this.selected.id === DEFAULT_SKIN.id) {
      this.showToast("默认皮肤不能赠送", true);
      return;
    }
    const name = window.prompt("输入好友的登录账号名，把「" + this.selected.name + "」送给他：");
    if (!name || !name.trim()) return;
    this.loading = true;
    const res = await skinApi.gift(this.selected.id, name.trim());
    this.loading = false;
    this.showToast(res.ok ? "赠送成功，好友登录即可使用" : (res.error || "赠送失败"), !res.ok);
  }

  /** 复制选中的提示词（含规格后缀）到剪贴板，引导去外部 AI 工具做图 */
  private async copyPrompt(): Promise<void> {
    const tpl = this.templates[this.selectedTpl];
    if (!tpl) {
      this.showToast("暂无可用提示词模板", true);
      return;
    }
    const text = tpl.fullPrompt || tpl.prompt;
    try {
      await navigator.clipboard.writeText(text);
      this.showToast("提示词已复制，去即梦/豆包等 AI 工具生成图片");
    } catch {
      this.showToast("复制失败，请长按模板查看后手动复制", true);
    }
  }

  /** 是否含本地 dataURL 贴图（这类贴图无法被他人访问，不能发布） */
  private hasLocalDataImage(skin: SkinConfig): boolean {
    const isData = (u?: string) => !!u && u.startsWith("data:");
    if (isData(skin.bg?.image) || isData(skin.board?.image)) return true;
    return Object.values(skin.tiles ?? {}).some((t) => isData(t?.image));
  }

  private async exportShare(): Promise<void> {
    const code = encodeShareCode(this.selected);
    try {
      await navigator.clipboard.writeText(code);
      this.showToast("分享码已复制到剪贴板");
    } catch {
      this.showToast(`分享码已生成（${code.length} 字符），请手动复制`);
    }
  }

  private importShare(): void {
    const code = window.prompt("粘贴好友分享的皮肤码：");
    if (!code) return;
    const res = decodeShareCode(code);
    if (!res.ok || !res.skin) {
      this.showToast(res.error || "导入失败", true);
      return;
    }
    const c = checkSkinContrast(res.skin);
    if (!c.ok) {
      this.showToast(`对比度 ${c.ratio.toFixed(2)}:1 不达标，已拒绝导入`, true);
      return;
    }
    unlockSkin(res.skin.id);
    void skinStore.save(res.skin).then(() => this.load());
    this.selected = res.skin;
    this.showToast(`已导入「${res.skin.name}」`);
  }

  private async redeem(m: MarketSkin): Promise<void> {
    if (!skinApi.available()) {
      this.showToast("请先登录后再兑换", true);
      return;
    }
    this.loading = true;
    const res = await skinApi.redeem(m.skinId);
    this.loading = false;
    if (!res.ok) {
      this.showToast(res.error || "兑换失败", true);
      return;
    }
    // 以服务端余额为准覆盖本地，避免双写漂移
    if (res.data && typeof res.data.balance === "number") progress.setPoints(res.data.balance);
    unlockSkin(m.skinId);
    await skinStore.save(m.config);
    this.selected = m.config;
    skinManager.apply(m.config);
    this.showToast(`兑换成功，已应用「${m.name}」`);
    void this.load();
  }

  /** 删除皮肤：先恢复默认（若正在使用），再清本地库，已登录时同步删除云端 */
  private async removeSkin(skin: SkinConfig): Promise<void> {
    if (skinManager.getId() === skin.id) {
      skinManager.reset();
      this.selected = DEFAULT_SKIN;
    }
    await skinStore.remove(skin.id);
    if (skinApi.available()) void skinApi.deleteSkin(skin.id);
    this.showToast(`已删除「${skin.name}」`);
    void this.load();
  }

  private async doGuestLogin(): Promise<void> {
    this.loading = true;
    const res = await authStore.loginGuest();
    this.loading = false;
    this.showToast(res.ok ? "已登录（游客），可使用云端功能" : (res.error || "登录失败"), !res.ok);
    if (res.ok) void this.load();
  }

  /** 打开系统文件选择器（canvas 内无法输入，用隐藏 input 触发） */
  private openUpload(): void {
    if (!this.fileInput) {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/png,image/jpeg,image/webp";
      input.style.display = "none";
      input.addEventListener("change", () => {
        const f = input.files?.[0];
        if (f) void this.handleUpload(f);
        input.value = "";
      });
      document.body.appendChild(input);
      this.fileInput = input;
    }
    this.fileInput.click();
  }

  /** 处理上传素材：体积 → 像素 → 对比度，任一不达标都给出明确提示 */
  private async handleUpload(file: File): Promise<void> {
    if (file.size > MAX_SKIN_IMAGE_BYTES) {
      this.showToast(`图片体积超过上限（${MAX_SKIN_IMAGE_BYTES / 1024 / 1024}MB）`, true);
      return;
    }
    this.loading = true;
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(new Error("读取失败"));
        fr.readAsDataURL(file);
      });
      const sizeCheck = await checkImageSize(dataUrl);
      if (!sizeCheck.ok) {
        this.loading = false;
        this.showToast(sizeCheck.error || "图片尺寸不合规", true);
        return;
      }
      // 已登录且后端可用 → 上传拿到服务端 URL；否则本地用 dataURL
      let image = dataUrl;
      if (skinApi.available()) {
        const up = await skinApi.upload(file, file.name);
        if (up.ok && up.data) image = up.data.url;
      }
      const skin: SkinConfig = {
        ...DEFAULT_SKIN,
        id: `skin_${Date.now().toString(36)}`,
        name: "我的上传皮肤",
        author: "我",
        createdAt: Date.now(),
        tags: ["我的"],
        bg: { ...DEFAULT_SKIN.bg, image },
      };
      const c = checkSkinContrast(skin);
      if (!c.ok) {
        this.loading = false;
        this.showToast(`对比度 ${c.ratio.toFixed(2)}:1 不达标，请换一张`, true);
        return;
      }
      unlockSkin(skin.id);
      await skinStore.save(skin);
      this.selected = skin;
      skinManager.apply(skin);
      this.loading = false;
      this.showToast("已应用上传的皮肤");
      void this.load();
    } catch {
      this.loading = false;
      this.showToast("读取图片失败", true);
    }
  }

  // === 渲染 ===

  private render(): void {
    const w = gameCanvas.getW();
    const h = gameCanvas.getH();

    gameCanvas.draw((ctx) => {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#1a1a2e");
      grad.addColorStop(0.6, "#16213e");
      grad.addColorStop(1, "#0f3460");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }, 0);

    // 返回 + 标题 + 积分
    gameCanvas.drawRoundRect(this.backRect.x, this.backRect.y, this.backRect.w, this.backRect.h, 12,
      "rgba(255,255,255,0.10)", 5);
    gameCanvas.drawText("‹", this.backRect.x + 26, this.backRect.y + 27,
      { size: 30, color: "#e6ebff", bold: true }, 6);
    gameCanvas.drawText("🎨 换装花园", w / 2, 44, { size: 24, color: "#FFE66D", bold: true }, 6);
    gameCanvas.drawText(`积分 ${progress.getPoints()}`, w - 16, 40,
      { size: 15, color: "#FFE66D", bold: true, align: "right" }, 6);

    // 登录态 / 登录入口
    this.loginRect = { x: 0, y: 0, w: 0, h: 0 };
    if (skinApi.backendConfigured() && !authStore.isLoggedIn()) {
      const lw = 120;
      this.loginRect = { x: w - lw - 14, y: 56, w: lw, h: 34 };
      gameCanvas.drawRoundRect(this.loginRect.x, this.loginRect.y, lw, 34, 10, "rgba(78,205,196,0.22)", 5);
      gameCanvas.drawStrokeRect(this.loginRect.x, this.loginRect.y, lw, 34, 10, "rgba(78,205,196,0.7)", 1.5, 6);
      gameCanvas.drawText("登录同步", this.loginRect.x + lw / 2, this.loginRect.y + 17,
        { size: 13, color: "#4ECDC4", bold: true }, 6);
    }

    // 预览区
    const pvY = 100;
    const pvX = 18;
    const pvW = w - 36;
    const pvH = 130;
    this.drawPreview(pvX, pvY, pvW, pvH);

    // 标签
    this.renderTabs(w, pvY + pvH + 14);

    // 内容
    const contentTop = pvY + pvH + 14 + 40;
    this.cardRects = [];
    this.deleteRects = [];
    this.templateRects = [];
    this.copyRect = { x: 0, y: 0, w: 0, h: 0 };
    this.uploadRect = { x: 0, y: 0, w: 0, h: 0 };
    if (this.tab === "mine") this.renderMine(w, contentTop);
    else if (this.tab === "market") this.renderMarket(w, contentTop);
    else this.renderAi(w, contentTop);

    // 底部操作条
    this.renderActions(w, h);

    if (this.loading) {
      gameCanvas.drawText("处理中…", w / 2, h - 150, { size: 16, color: "#9aa3c8" }, 60);
    }

    // 吐司
    if (performance.now() < this.toastUntil && this.toastText) {
      const tw = Math.min(w - 40, this.toastText.length * 14 + 40);
      const tx = (w - tw) / 2;
      const ty = h - 118;
      gameCanvas.draw((ctx) => {
        ctx.fillStyle = this.toastErr ? "rgba(231,76,60,0.92)" : "rgba(0,0,0,0.86)";
        ctx.beginPath();
        ctx.roundRect(tx, ty, tw, 38, 10);
        ctx.fill();
      }, 250);
      gameCanvas.drawText(this.toastText, w / 2, ty + 19, { size: 14, color: "#fff" }, 251);
    }
  }

  /** 实时预览：用「当前选中」皮肤绘制迷你棋盘（未应用也能看到效果） */
  private drawPreview(x: number, y: number, pw: number, ph: number): void {
    const s = this.selected;
    const boardBase = s.board?.base ?? DEFAULT_SKIN.board.base;
    const boardStroke = s.board?.stroke ?? DEFAULT_SKIN.board.stroke;
    const bgColors = s.bg?.colors?.length ? s.bg.colors : DEFAULT_SKIN.bg.colors;

    gameCanvas.draw((ctx) => {
      const g = ctx.createLinearGradient(x, y, x, y + ph);
      bgColors.forEach((c, i) => g.addColorStop(i / Math.max(1, bgColors.length - 1), c));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(x, y, pw, ph, 14);
      ctx.fill();

      ctx.fillStyle = boardBase;
      ctx.beginPath();
      ctx.roundRect(x + 10, y + 10, pw - 20, ph - 20, 10);
      ctx.fill();
      ctx.strokeStyle = boardStroke;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }, 4);

    // 迷你棋子 5 枚
    const tileW = (pw - 40) / 5;
    for (let i = 0; i < 5; i++) {
      const type = TILE_PREVIEW[i];
      const style = s.tiles?.[type] ?? DEFAULT_SKIN.tiles[type] ?? { color: "#888", label: "" };
      const tx = x + 20 + i * tileW;
      const ty = y + ph / 2 - tileW / 2;
      const size = Math.min(tileW - 8, ph - 40);
      gameCanvas.draw((ctx) => {
        ctx.fillStyle = style.color;
        ctx.beginPath();
        ctx.roundRect(tx + 4, ty, size, size, 8);
        ctx.fill();
      }, 5);
      gameCanvas.drawText(style.label, tx + 4 + size / 2, ty + size / 2,
        { size: 16, color: "#fff", bold: true }, 6);
    }

    const isCur = skinManager.getId() === s.id;
    gameCanvas.drawText(`${s.name}${isCur ? " · 使用中" : ""}`, x + pw / 2, y + ph - 6,
      { size: 12, color: "#e6ebff" }, 6);
  }

  private renderTabs(w: number, y: number): void {
    this.tabRects = [];
    const gap = 10;
    const tw = (w - 36 - gap * 2) / 3;
    const labels: [string, Tab][] = [["我的皮肤", "mine"], ["模板中心", "market"], ["AI 做图", "ai"]];
    labels.forEach(([label, key], i) => {
      const x = 18 + i * (tw + gap);
      const rect: Rect = { x, y, w: tw, h: 32 };
      this.tabRects.push(rect);
      const active = this.tab === key;
      gameCanvas.draw((ctx) => {
        ctx.fillStyle = active ? "rgba(78,205,196,0.20)" : "rgba(255,255,255,0.06)";
        ctx.beginPath();
        ctx.roundRect(x, y, tw, 32, 10);
        ctx.fill();
        ctx.strokeStyle = active ? "rgba(78,205,196,0.85)" : "rgba(255,255,255,0.14)";
        ctx.lineWidth = active ? 2 : 1;
        ctx.stroke();
      }, 5);
      gameCanvas.drawText(label, x + tw / 2, y + 16,
        { size: 14, color: active ? "#4ECDC4" : "#c3cadf", bold: active }, 6);
    });
  }

  private renderMine(w: number, top: number): void {
    const list = [DEFAULT_SKIN, ...this.mine];
    const cols = 2;
    const cw = (w - 36 - 12) / 2;
    const ch = 92;
    const gap = 12;
    list.forEach((skin, i) => {
      const x = 18 + (i % cols) * (cw + gap);
      const y = top + Math.floor(i / cols) * (ch + gap);
      // 云端作品的审核状态徽标（本地皮肤无）
      const st = this.cloudStatus.get(skin.id);
      let badge: string | undefined;
      if (st) {
        if (st.status === 2) badge = "⏳待审核";
        else if (st.status === 0 && st.reviewNote) badge = "⛔已驳回";
        else badge = undefined;
      }
      this.drawSkinCard(skin, x, y, cw, ch, badge ?? "免费");
      this.cardRects.push({ rect: { x, y, w: cw, h: ch }, skin });
      // 非默认皮肤提供删除角标（热区 44px，符合适老化）
      if (skin.id !== DEFAULT_SKIN.id) {
        const dx = x + cw - 44;
        const dy = y;
        gameCanvas.drawRoundRect(dx + 6, dy + 6, 32, 32, 10, "rgba(224,122,106,0.85)", 6);
        gameCanvas.drawText("×", dx + 22, dy + 23, { size: 20, color: "#fff", bold: true }, 7);
        this.deleteRects.push({ rect: { x: dx, y: dy, w: 44, h: 44 }, skin });
      }
    });
  }

  private renderMarket(w: number, top: number): void {
    if (!skinApi.backendConfigured()) {
      gameCanvas.drawText("模板中心需要配置后端", w / 2, top + 30,
        { size: 16, color: "#FFE66D", bold: true }, 5);
      gameCanvas.drawText("设置 GAME_SERVER_API_URL 后即可浏览", w / 2, top + 56,
        { size: 13, color: "#9aa3c8" }, 5);
      gameCanvas.drawText("他人皮肤 · 敬请期待", w / 2, top + 84, { size: 13, color: "#6b7396" }, 5);
      return;
    }
    if (this.market.length === 0) {
      gameCanvas.drawText("暂无上架皮肤，快来发布第一个吧", w / 2, top + 40,
        { size: 14, color: "#9aa3c8" }, 5);
      return;
    }
    const cols = 2;
    const cw = (w - 36 - 12) / 2;
    const ch = 92;
    const gap = 12;
    this.market.forEach((m, i) => {
      const x = 18 + (i % cols) * (cw + gap);
      const y = top + Math.floor(i / cols) * (ch + gap);
      const price = m.pricePoints > 0 ? `${m.pricePoints} 积分` : (m.priceCents > 0 ? `¥${(m.priceCents / 100).toFixed(0)}` : "免费");
      this.drawSkinCard(m.config, x, y, cw, ch, price, isUnlocked(m.skinId) ? "已拥有" : undefined);
      this.cardRects.push({ rect: { x, y, w: cw, h: ch }, skin: m.config, market: m });
    });
  }

  private renderAi(w: number, top: number): void {
    if (!skinApi.backendConfigured()) {
      gameCanvas.drawText("AI 做图指引需要配置后端", w / 2, top + 30,
        { size: 16, color: "#FFE66D", bold: true }, 5);
      gameCanvas.drawText("设置 GAME_SERVER_API_URL 后即可使用", w / 2, top + 56,
        { size: 13, color: "#9aa3c8" }, 5);
      return;
    }
    if (this.templates.length === 0) {
      gameCanvas.drawText("暂无提示词模板", w / 2, top + 40, { size: 14, color: "#9aa3c8" }, 5);
      return;
    }
    const cols = 2;
    const cw = (w - 36 - 12) / 2;
    const ch = 44;
    const gap = 12;
    this.templates.forEach((tpl, i) => {
      const x = 18 + (i % cols) * (cw + gap);
      const y = top + Math.floor(i / cols) * (ch + gap);
      const active = this.selectedTpl === i;
      this.templateRects.push({ rect: { x, y, w: cw, h: ch }, tpl });
      gameCanvas.draw((ctx) => {
        ctx.fillStyle = active ? "rgba(78,205,196,0.20)" : "rgba(255,255,255,0.06)";
        ctx.beginPath();
        ctx.roundRect(x, y, cw, ch, 10);
        ctx.fill();
        ctx.strokeStyle = active ? "rgba(78,205,196,0.85)" : "rgba(255,255,255,0.14)";
        ctx.lineWidth = active ? 2 : 1;
        ctx.stroke();
      }, 5);
      gameCanvas.drawText(tpl.label, x + cw / 2, y + (tpl.prompt ? 16 : 22),
        { size: 14, color: active ? "#4ECDC4" : "#e6ebff", bold: active }, 6);
      if (tpl.prompt) {
        gameCanvas.drawText(tpl.prompt.slice(0, 16) + "…", x + cw / 2, y + 34,
          { size: 10, color: "#8b93b8" }, 6);
      }
    });

    const btnY = top + Math.ceil(this.templates.length / cols) * (ch + gap) + 8;
    const bw = Math.min(w - 40, 320);
    const bx = (w - bw) / 2;

    // 主入口：复制提示词（平台不出图，玩家拿去外部 AI 工具自行生成）
    this.copyRect = { x: bx, y: btnY, w: bw, h: 50 };
    gameCanvas.draw((ctx) => {
      const g = ctx.createLinearGradient(bx, btnY, bx, btnY + 50);
      g.addColorStop(0, "#FFE66D");
      g.addColorStop(1, "#f0b53e");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(bx, btnY, bw, 50, 12);
      ctx.fill();
    }, 5);
    gameCanvas.drawText("📋 复制提示词去 AI 做图", w / 2, btnY + 26,
      { size: 18, color: "#0c1a22", bold: true }, 6);

    // 次入口：上传做好的图片 → 生成皮肤
    const upY = btnY + 62;
    this.uploadRect = { x: bx, y: upY, w: bw, h: 44 };
    gameCanvas.drawRoundRect(bx, upY, bw, 44, 12, "rgba(78,205,196,0.18)", 5);
    gameCanvas.drawStrokeRect(bx, upY, bw, 44, 12, "rgba(78,205,196,0.7)", 1.5, 6);
    gameCanvas.drawText("📁 上传做好的图（png/jpg/webp ≤2MB）", w / 2, upY + 22,
      { size: 14, color: "#4ECDC4", bold: true }, 6);

    // 流程说明（适老化：一步一行，大间距）
    const tipY = upY + 66;
    const tips = [
      "1 点上方按钮复制提示词",
      "2 打开即梦 / 豆包等 AI 工具粘贴生成",
      "3 保存图片后回到这里上传",
      "4 「我的皮肤」里选中 → 发布送审",
      "5 审核通过即可上架被购买 / 赠送",
    ];
    tips.forEach((t, i) => {
      gameCanvas.drawText(t, w / 2, tipY + i * 22, { size: 12, color: "#9aa3c8" }, 5);
    });
    if (this.specText) {
      gameCanvas.drawText(`规格：${this.specText.slice(0, 24)}…`, w / 2, tipY + tips.length * 22 + 4,
        { size: 11, color: "#6b7396" }, 5);
    }
  }

  private drawSkinCard(
    skin: SkinConfig, x: number, y: number, cw: number, ch: number,
    priceText: string, ownedText?: string,
  ): void {
    const isSel = this.selected?.id === skin.id;
    gameCanvas.draw((ctx) => {
      ctx.fillStyle = isSel ? "rgba(78,205,196,0.16)" : "rgba(255,255,255,0.06)";
      ctx.beginPath();
      ctx.roundRect(x, y, cw, ch, 12);
      ctx.fill();
      ctx.strokeStyle = isSel ? "rgba(78,205,196,0.85)" : "rgba(255,255,255,0.14)";
      ctx.lineWidth = isSel ? 2 : 1;
      ctx.stroke();

      // 缩略条：背景渐变 + 三枚棋子色
      const colors = skin.bg?.colors?.length ? skin.bg.colors : DEFAULT_SKIN.bg.colors;
      const g = ctx.createLinearGradient(x + 8, y + 8, x + cw - 8, y + 8);
      colors.forEach((c, i) => g.addColorStop(i / Math.max(1, colors.length - 1), c));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(x + 8, y + 8, cw - 16, 34, 8);
      ctx.fill();
      const keys = ["flower", "leaf", "fruit"];
      for (let i = 0; i < keys.length; i++) {
        const st = skin.tiles?.[keys[i]] ?? DEFAULT_SKIN.tiles[keys[i]];
        if (!st) continue;
        ctx.fillStyle = st.color;
        ctx.beginPath();
        ctx.roundRect(x + 16 + i * 22, y + 16, 18, 18, 5);
        ctx.fill();
      }
    }, 4);

    gameCanvas.drawText(skin.name, x + 8, y + 58, { size: 13, color: "#fff", bold: true, align: "left" }, 5);
    gameCanvas.drawText(ownedText ?? priceText, x + 8, y + 78,
      { size: 12, color: ownedText ? "#4ECDC4" : "#FFE66D", align: "left" }, 5);
  }

  private renderActions(w: number, h: number): void {
    this.actionRects = [];
    // 三列布局：两行总高必须落在屏幕内（此前 2 列 50px 高会溢出到 844 之外）
    const cols = 3;
    const bw = (w - 40 - 12 * (cols - 1)) / cols;
    const bh = 44;
    const rowGap = 6;
    const y = h - NAV_H - 26;
    const keys: [string, string, string][] = [
      ["apply", "应用皮肤", "#FFE66D"],
      ["default", "恢复默认", "#c3cadf"],
      ["publish", "发布送审", "#4ECDC4"],
      ["export", "导出分享码", "#c3cadf"],
      ["import", "导入分享码", "#c3cadf"],
      ["gift", "赠送好友", "#c3cadf"],
    ];
    keys.forEach(([key, label, color], i) => {
      const x = 20 + (i % cols) * (bw + 12);
      const yy = y + Math.floor(i / cols) * (bh + rowGap);
      const primary = key === "apply";
      gameCanvas.drawRoundRect(x, yy, bw, bh, 12,
        primary ? "rgba(255,230,109,0.22)" : "rgba(255,255,255,0.08)", 5);
      gameCanvas.drawStrokeRect(x, yy, bw, bh, 12,
        primary ? "rgba(255,230,109,0.8)" : "rgba(255,255,255,0.18)", 1.5, 6);
      gameCanvas.drawText(label, x + bw / 2, yy + bh / 2,
        { size: 13, color, bold: primary }, 6);
      this.actionRects.push({ key, rect: { x, y: yy, w: bw, h: bh } });
    });
  }

  destroy(): void {
    gameCanvas.clearHandlers();
    gameCanvas.setUpdateCallback(null);
  }
}
