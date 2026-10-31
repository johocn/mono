// DragonBones（龙骨）运行时类型声明
//
// 运行时文件：public/libs/laya.dragonbones.js
// 该文件不在 npm / 开源仓库里，需从「LayaAir 3.3.4 引擎包」（与你现有的
// laya.core.js 同源）复制到 public/libs/ 下。版本必须与 laya.core.js 一致（3.3.4）。
//
// 本声明只是最小可用接口，便于类型检查；实际可用的 API 以你拿到的
// laya.dragonbones.js 为准（不同小版本类名/方法可能略有差异）。

declare namespace Laya {
  namespace DragonBone {
    /** 龙骨骨骼显示对象（继承自 Laya.Sprite） */
    class Skeleton extends Laya.Sprite {
      constructor();

      /**
       * 加载 DragonBones 资源。
       * @param url 骨骼数据文件（.json）。同目录需存在同名图集（.png / .atlas）。
       * @param complete 加载完成回调（Laya.Handler）。
       */
      load(url: string, complete?: Laya.Handler): void;

      /** 播放指定动画 */
      play(animName?: string, loop?: boolean, force?: boolean): void;

      /** 停止播放 */
      stop(): void;

      /** 当前正在播放的动画名 */
      readonly playing: string;

      /** 缓存模式等可选配置 */
      cacheMode?: number;
    }

    /** 龙骨模板（部分版本用于预编译后构建 Skeleton） */
    class Templet {
      constructor();
      load(url: string, complete?: Laya.Handler): void;
      buildArmature(name?: string): Skeleton;
    }
  }
}
