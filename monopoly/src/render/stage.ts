import { Application, Container, Graphics } from 'pixi.js';
import { STAGE_W, STAGE_H } from '../skin/layout';

export { STAGE_W, STAGE_H };

export interface Stage {
  app: Application;
  layers: { ground: Container; labels: Container; pieces: Container; fx: Container };
  destroy(): void;
}

/** 三遍绘制容器：地面+建筑 → 汉字标签 → 棋子（fx 为特效，独立于排序） */
export async function createStage(canvas: HTMLCanvasElement, opts: { bg: number; dpr: number }): Promise<Stage> {
  const app = new Application();
  await app.init({
    canvas,
    width: STAGE_W,
    height: STAGE_H,
    background: opts.bg,
    antialias: true,
    resolution: opts.dpr,
    autoDensity: true,
  });

  const ground = new Container();
  const labels = new Container();
  const pieces = new Container();
  const fx = new Container();
  ground.label = 'ground';
  labels.label = 'labels';
  pieces.label = 'pieces';
  fx.label = 'fx';
  app.stage.addChild(ground, labels, pieces, fx);

  // 空场景也得「出画面」：铺一层占位底，证明管线活着
  const probe = new Graphics();
  probe.rect(0, 0, STAGE_W, STAGE_H).fill(opts.bg);
  ground.addChild(probe);

  return {
    app,
    layers: { ground, labels, pieces, fx },
    destroy: () => app.destroy(true),
  };
}