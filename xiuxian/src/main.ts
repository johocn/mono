import { Game } from "./Game";

async function boot(): Promise<void> {
  // LayaAir 3 的 init 是异步的（返回 Promise），必须 await 完成后再操作 stage
  await Laya.init(1280, 720);
  Laya.stage.alignH = Laya.Stage.ALIGN_CENTER;
  Laya.stage.alignV = Laya.Stage.ALIGN_MIDDLE;
  // 满屏无黑边：等比放大铺满（cover），超出部分裁切，而非 SCALE_SHOWALL 的居中留黑边。
  // 边缘裁切量由 Game.layoutAll 计算并内缩 HUD/技能栏/移动控件，保证关键 UI 不被裁掉。
  Laya.stage.scaleMode = Laya.Stage.SCALE_NOBORDER;
  Laya.stage.screenMode = Laya.Stage.SCREEN_HORIZONTAL;
  Laya.stage.bgColor = "#101018";

  const game = new Game();
  game.start();
  // 预加载 AI 仙侠素材（未启用时静默回退程序化，详情见 src/data/mapAssets.ts）
  game.preloadMapAssets();

  // 暴露给自动化冒烟测试（对生产无副作用）
  (window as any).__game = game;
}

boot();
