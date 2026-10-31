/**
 * Live2D × Laya 集成沙盒（最小可运行骨架）。
 * 适配自 Live2D 官方 Cubism Web Samples（TypeScript/Demo），用「独立透明 WebGL 画布叠加层」
 * 渲染 Cubism 模型——这正是接入 LayaAir 3.3.4 的推荐路径（vendored Laya 不含 Live2D 模块）。
 *
 * 叠加层模式：本画布浮于 Laya 画布之上（pointer-events:none 让触控穿透到游戏），
 * 由游戏对话事件（speaker 变化）驱动 startMotion，空闲播 idle。生产接入时把 load/draw 包成
 * 一个 Live2DRig 类，挂到 Actor/Rig 的降级链（有模型用 Live2D，无则退回程序化 Rig）。
 *
 * 注意：以下 import 路径与 API 严格对应 Cubism Web Framework 源码结构，运行前需把 SDK 放入 vendor/。
 * Vite(esbuild) 会转译 TS，类型名若有细微版本差异以运行时报错为准，按官方 Demo 微调即可。
 */
import { CubismFramework } from "../vendor/CubismWebFramework/src/framework/CubismFramework.js";
import { CubismUserModel } from "../vendor/CubismWebFramework/src/framework/model/CubismUserModel.js";
import { CubismMatrix44 } from "../vendor/CubismWebFramework/src/framework/math/CubismMatrix44.js";

const status = (s: string) => {
  const el = document.getElementById("status");
  if (el) el.textContent = s;
  // eslint-disable-next-line no-console
  console.log("[live2d-sandbox]", s);
};

async function main(): Promise<void> {
  const canvas = document.getElementById("cv") as HTMLCanvasElement;
  const gl = (canvas.getContext("webgl2") || canvas.getContext("webgl")) as WebGLRenderingContext | null;
  if (!gl) {
    status("WEBGL_UNAVAILABLE");
    return;
  }
  if (typeof (window as any).Live2DCubismCore === "undefined") {
    status("CORE_MISSING");
    return;
  }

  CubismFramework.startUp();
  CubismFramework.initialize();

  // CubismUserModel.loadAssets 已封装 moc3 / 贴图 / 动作 / 物理 / 表情的加载。
  const model = new (class extends CubismUserModel {})();
  try {
    await (model as any).loadAssets("./vendor/Hiyori", "Hiyori.model3.json");
  } catch (e) {
    status("LOAD_FAIL:" + (e as Error).message);
    return;
  }

  const proj = new CubismMatrix44();
  proj.scale(2, 2);

  let last = performance.now();
  const loop = (now: number) => {
    const dt = (now - last) / 1000;
    last = now;
    (model as any).update(dt);
    const r: any = (model as any).getRenderer();
    if (r) {
      r.setMvpMatrix(proj);
      r.drawModel();
    }
    requestAnimationFrame(loop);
  };
  status("RENDERING");
  requestAnimationFrame(loop);
}

void main();
