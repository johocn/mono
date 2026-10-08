/**
 * ExitGuard — 适老化退出保护（首页弹确认，非首页走内部返回，绝不误退出网页）
 * 轻量实现：监听 popstate；首页时提示确认，非首页时回调内部返回。
 */

interface ExitHandlers {
  onConfirm: () => void;
  onInternalBack: () => void;
}

class ExitGuard {
  private handlers: ExitHandlers | null = null;
  private atHome = true;

  private onPop = (): void => {
    if (!this.handlers) return;
    if (this.atHome) this.handlers.onConfirm();
    else this.handlers.onInternalBack();
  };

  install(handlers: ExitHandlers): void {
    this.handlers = handlers;
    window.addEventListener("popstate", this.onPop);
  }

  uninstall(): void {
    window.removeEventListener("popstate", this.onPop);
    this.handlers = null;
  }

  setAtHome(v: boolean): void { this.atHome = v; }
}

export const exitGuard = new ExitGuard();
