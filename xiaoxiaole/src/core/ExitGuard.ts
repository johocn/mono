/**
 * ExitGuard — H5 退出拦截（适老化防误触）
 *
 * 需求：老人很容易误触返回键/滑动返回直接退出网页。
 * 策略（与产品确认）：
 * - 只在首页（主菜单）拦截退出：弹出游戏内确认面板，由玩家自己决定
 * - 非首页按返回 = 游戏内返回上一页，绝不退出网页（防止「关卡玩到一半没了」）
 *
 * 实现：
 * - history.pushState 哨兵 + popstate：微信内置浏览器 beforeunload 不可靠，
 *   返回键拦截以 popstate 为主；每次拦截后立刻补回哨兵，保证下次还能拦
 * - beforeunload：仅首页生效，兜底「关闭标签页 / 刷新」
 *
 * 注意：SSO 整页跳转（redirectToSsoLogin）前必须 uninstall，避免与
 * SsoAuth 的 history.replaceState 互相干扰。
 */

type ExitHandlers = {
  /** 首页按返回：由调用方弹出自己的确认面板 */
  onConfirm(): void;
  /** 非首页按返回：游戏内返回上一页 */
  onInternalBack(): void;
};

export class ExitGuard {
  private installed = false;
  private leaving = false;
  private atHome = true;
  private handlers: ExitHandlers | null = null;

  /** 安装拦截（幂等）。仅在 SSO 判断之后调用，避免影响整页跳转 */
  install(handlers: ExitHandlers): void {
    if (this.installed) return;
    this.handlers = handlers;
    this.installed = true;
    window.addEventListener("popstate", this.onPopState);
    window.addEventListener("beforeunload", this.onBeforeUnload);
    this.pushSentinel();
  }

  /** 卸载（SSO 跳转 / 页面销毁前） */
  uninstall(): void {
    if (!this.installed) return;
    this.installed = false;
    window.removeEventListener("popstate", this.onPopState);
    window.removeEventListener("beforeunload", this.onBeforeUnload);
  }

  /** 路由每切换一次都要同步：只有首页才弹「确定离开」 */
  setAtHome(v: boolean): void {
    this.atHome = v;
  }

  /** 玩家选择「继续玩」：什么都不用做（哨兵已在拦截时补回） */
  stay(): void {
    this.leaving = false;
  }

  /** 玩家选择「离开」：真正退出本页 */
  leave(): void {
    this.leaving = true;
    // 微信内优先关闭 webview
    const wx = (window as unknown as { WeixinJSBridge?: { invoke?: (n: string, p: unknown, cb: unknown) => void } })
      .WeixinJSBridge;
    if (wx?.invoke) {
      try { wx.invoke("closeWindow", {}, () => undefined); } catch { /* 忽略 */ }
      return;
    }
    try { window.history.back(); } catch { /* 忽略 */ }
    // 兜底：没有上一条历史时尝试关闭窗口
    window.setTimeout(() => {
      try { window.close(); } catch { /* 忽略 */ }
    }, 600);
  }

  private pushSentinel(): void {
    try {
      window.history.pushState({ xxlGuard: Date.now() }, "", window.location.href);
    } catch { /* 忽略 */ }
  }

  private onPopState = (): void => {
    // 玩家已确认离开：不再拦
    if (this.leaving) return;
    // 补回哨兵，保证下一次返回依然被拦到
    this.pushSentinel();
    if (!this.handlers) return;
    if (this.atHome) this.handlers.onConfirm();
    else this.handlers.onInternalBack();
  };

  private onBeforeUnload = (e: BeforeUnloadEvent): void => {
    if (this.leaving || !this.atHome) return;
    e.preventDefault();
    e.returnValue = "要离开花园吗？";
  };
}

export const exitGuard = new ExitGuard();
