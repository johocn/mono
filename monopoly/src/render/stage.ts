import { Application, Container, CullerPlugin, Graphics, extensions } from 'pixi.js';
import { STAGE_W, STAGE_H } from '../skin/layout';

export { STAGE_W, STAGE_H };

/**
 * 裁剪插件（spec §7 R3）：`world` 是相机作用域，取景放大后棋盘大半落在画布外——
 * 不开裁剪则「放大反而不省」（绘制量不降反升），`world.cullable` 也形同虚设。
 * Pixi v8 的裁剪是**可选插件**，必须在 `app.init()` 之前注册，否则 `cullable` / `cullArea` 不生效。
 * 只裁剪 `world`（`cullable = true`），`fxUi` / DOM 覆盖层不受影响。
 */
extensions.add(CullerPlugin);

export interface Stage {
  app: Application;
  /** 相机作用域：`world.scale/position` 由 `src/render/camera.ts` 驱动 */
  world: Container;
  layers: {
    ground: Container;
    labels: Container;
    pieces: Container;
    /** 世界空间动效（跟相机）：`hop`/`dust`/`buy`/`upgrade`/`rent`/`shard`/`end` */
    fxWorld: Container;
    /** UI 空间动效 + pass 4 屏幕空间元素（不跟相机）：`dice`/`card`/`deck`/`stock`/`shine`、HUD、浮层、气泡 */
    fxUi: Container;
  };
  destroy(): void;
}

/**
 * 拆层（spec §5.3）：容器树
 * ```
 * app.stage
 *   ├─ world  (cullable = true，camera 作用域)
 *   │    ├─ ground → labels → pieces → fxWorld
 *   └─ fxUi   (屏幕空间，不跟相机)
 * ```
 * `world` 的初始变换为恒等（由 `createCamera()` 写入），故与改动前逐像素一致。
 */
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

  const world = new Container();
  const ground = new Container();
  const labels = new Container();
  const pieces = new Container();
  const fxWorld = new Container();
  const fxUi = new Container();
  world.label = 'world';
  world.cullable = true;
  ground.label = 'ground';
  labels.label = 'labels';
  pieces.label = 'pieces';
  fxWorld.label = 'fxWorld';
  fxUi.label = 'fxUi';
  world.addChild(ground, labels, pieces, fxWorld);
  app.stage.addChild(world, fxUi);

  // 空场景也得「出画面」：铺一层占位底，证明管线活着
  const probe = new Graphics();
  probe.rect(0, 0, STAGE_W, STAGE_H).fill(opts.bg);
  ground.addChild(probe);

  return {
    app,
    world,
    layers: { ground, labels, pieces, fxWorld, fxUi },
    destroy: () => app.destroy(true),
  };
}