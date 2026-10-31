/**
 * 美术资源登记与加载：三界舆图 + 四位主要角色立绘。
 *
 * 资源放在 `public/art/` 下，Vite 直接以站点根路径提供（`/art/xxx.png`），
 * 运行时用 Laya.loader 预加载，加载完成后通知订阅者重绘（Rig / NPC / 舆图面板）。
 *
 * Node 冒烟环境下 Laya 是桩，没有 loader —— 这里全部走 null 兜底，
 * 逻辑测试与浏览器渲染互不干扰。
 */
export const ART = {
  /** 三界（人界 / 灵界 / 仙界）古风卷轴舆图 */
  mapSanjie: "art/sanjie-map.png",
  hanli: "art/hanli.png",
  nangongwan: "art/nangongwan.png",
  yinyue: "art/yinyue.png",
  lifeiyu: "art/lifeiyu.png",
  /** 透明底抠图（自动分割，scripts/cutout_art.py）：用于在地图上替换程序化小人 */
  cutHanli: "art/cut/hanli.png",
  /** 韩立青袍全身立绘抠图（整体律动模式用；export 脚本 hanli-robe job 抠品红幕产出） */
  cutHanliRobe: "art/cut/hanli-robe.png",
  cutNangongwan: "art/cut/nangongwan.png",
  cutYinyue: "art/cut/yinyue.png",
  cutLifeiyu: "art/cut/lifeiyu.png",
} as const;

export type ArtKey = keyof typeof ART;

const texCache = new Map<string, any>();
const listeners: (() => void)[] = [];
let loaded = false;

/** 取已加载纹理；未就绪返回 null（调用方按程序化兜底绘制） */
export function artTexture(url: string): any | null {
  const cached = texCache.get(url);
  if (cached) return cached;
  const loader: any = (globalThis as any)?.Laya?.loader;
  try {
    const t = loader?.getRes?.(url);
    if (t) {
      texCache.set(url, t);
      return t;
    }
  } catch {
    /* 桩/异常：按未就绪处理 */
  }
  return null;
}

/** 资源是否已就绪（浏览器加载完成后为 true；Node 下调用 loadArt 后亦为 true） */
export function artReady(): boolean {
  return loaded;
}

/** 订阅加载完成（已就绪则立即回调一次） */
export function onArtLoaded(cb: () => void): void {
  if (loaded) {
    cb();
    return;
  }
  listeners.push(cb);
}

/** 启动加载（幂等）。完成或失败都会置为就绪并通知订阅者 */
export function loadArt(): void {
  if (loaded) return;
  const L: any = (globalThis as any)?.Laya;
  const loader: any = L?.loader;
  const urls: string[] = Object.keys(ART).map((k) => (ART as any)[k]);

  let finished = false;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    loaded = true;
    // 回填缓存：无论走 Handler 回调还是 Promise，都统一从 loader 取一次
    for (const url of urls) artTexture(url);
    const cbs = listeners.splice(0, listeners.length);
    for (const cb of cbs) {
      try {
        cb();
      } catch {
        /* 单个订阅者异常不影响其它 */
      }
    }
  };

  if (!loader || typeof loader.load !== "function") {
    // Node 冒烟 / 无资源管线：直接就绪，走程序化兜底
    finish();
    return;
  }

  try {
    const handler = typeof L.Handler?.create === "function" ? L.Handler.create(null, finish) : undefined;
    const p = handler !== undefined ? loader.load(urls, handler) : loader.load(urls);
    if (p && typeof p.then === "function") {
      p.then(finish, finish);
      // Laya 部分版本 Promise 与 Handler 不并存：兜底定时确认一次
      setTimeout(finish, 3000);
    } else if (handler === undefined) {
      finish();
    }
  } catch {
    finish();
  }
}
