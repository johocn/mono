/**
 * ShareOverlay — 把离屏渲染的分享图（画像海报 / 家属微信卡片）以 DOM 浮层展示。
 *
 * 设计取舍（离线、无后端）：
 * - 移动端（尤其微信内）长按 <img> 即可「保存到相册」，是最稳的离线分享路径；
 * - 桌面端提供「下载」按钮（a[download] = dataURL）；
 * - 点击背景或「关闭」收起，浮层处于最高 z-index，覆盖游戏画布且不干扰其输入。
 */

function applyStyle(el: HTMLElement, style: Partial<CSSStyleDeclaration>): void {
  Object.assign(el.style, style as CSSStyleDeclaration);
}

export interface ShareOverlayOptions {
  hint?: string;
  fileName?: string;
}

export function showShareImage(dataUrl: string, opts: ShareOverlayOptions = {}): void {
  const existing = document.getElementById("share-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "share-overlay";
  applyStyle(overlay, {
    position: "fixed",
    inset: "0",
    zIndex: "9999",
    background: "rgba(0,0,0,0.84)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: '"Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif',
    padding: "16px",
    boxSizing: "border-box",
  });

  const img = document.createElement("img");
  img.src = dataUrl;
  img.alt = "分享图";
  applyStyle(img, {
    maxWidth: "86vw",
    maxHeight: "68vh",
    borderRadius: "16px",
    boxShadow: "0 14px 44px rgba(0,0,0,0.55)",
    display: "block",
  });
  // 让移动端长按走系统「保存图片」菜单（而非浏览器右键）
  img.addEventListener("contextmenu", (e) => e.preventDefault());

  const hint = document.createElement("div");
  hint.textContent = opts.hint ?? "长按图片「保存到相册」，或点下方按钮下载";
  applyStyle(hint, {
    color: "#cfd6f0",
    fontSize: "14px",
    marginTop: "14px",
    textAlign: "center",
    maxWidth: "90vw",
    lineHeight: "1.5",
  });

  const btnRow = document.createElement("div");
  applyStyle(btnRow, { display: "flex", gap: "12px", marginTop: "14px" });

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "关闭";
  styleBtn(closeBtn, "#444a6b", "#ffffff");
  closeBtn.addEventListener("click", () => overlay.remove());

  const dlBtn = document.createElement("a");
  dlBtn.textContent = "下载";
  dlBtn.href = dataUrl;
  dlBtn.download = opts.fileName ?? "brain-garden-share.png";
  styleBtn(dlBtn, "#4ECDC4", "#0c1a22");

  btnRow.appendChild(dlBtn);
  btnRow.appendChild(closeBtn);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  overlay.appendChild(img);
  overlay.appendChild(hint);
  overlay.appendChild(btnRow);
  document.body.appendChild(overlay);
}

function styleBtn(el: HTMLElement, bg: string, color: string): void {
  applyStyle(el, {
    background: bg,
    color,
    border: "none",
    borderRadius: "12px",
    padding: "11px 26px",
    fontSize: "16px",
    fontWeight: "700",
    cursor: "pointer",
    textDecoration: "none",
    lineHeight: "1",
  });
}
