# 架构治理清单（单人开发 · LayaAir）

> 来源：`zpqq132555/skills` 的 LayaAir 架构审查清单 + `sempitern0/indie-blueprint` 事件总线范式 + `DreamyMeng/开局一只史莱姆` 分层。
> 目标：渐进式消除 `Game.ts`(149KB) / `Player.ts`(75KB) 上帝类，不阻塞内容开发。

## 目录分层（参照史莱姆 core/ui/mod/table/test）
```
src/
  core/     引擎无关的游戏机制（战斗/资源/音频/输入/相机/事件总线）
  entities/ 游戏对象（Player/Monster/Actor）
  ui/       界面与面板
  data/     纯数据配置表（已落地，继续保持）
  map/      地图/场景相关（IsoMap 等）
```

## 强制规范（P1/P2 级）
1. **单例管理器**：全局状态统一由 `Manager` 层持有（`GameManager`/`SaveManager`/`CombatManager`），禁止在对象间互相硬引用。
2. **事件名常量化**：跨系统通信一律用 `src/core/EventBus.ts` 的 `GameEvent` 常量，禁止裸字符串。
3. **状态机枚举**：游戏状态用枚举（`Idle/Walk/Attack/...`），不用零散 boolean。
4. **资源加载前置**：资源在 `Main` 阶段经 `Assets.ts` 全部就绪，进入游戏后不再按需加载。
5. **私有约定**：私有方法/属性统一 `_` 前缀；魔法数字提取为 `private static readonly` 常量；时间参数注释单位（毫秒/秒/帧）。

## 渐进式拆分路线（不一次性重写）
- ✅ 已落地：`EventBus.ts` 基础设施 + `GameEvent` 常量。
- ✅ 已落地：`SaveManager`（`src/core/SaveManager.ts`）：存档「云优先 + 本地兜底」策略从 `Game.ts` 收敛；`Game` 仅保留社交/排行榜所需的 `this.cloud` 引用，存档三处（saveGame/continueGame/login）改用 `saveMgr`。`tsc 0` + `smoke 1177/0` 验证无回归。
- 下一步：抽 `CombatManager`（`Combat.ts` 纯函数 + `Game.ts` 战斗编排收敛）。
- 持续：新功能优先以「Manager + 事件」形态写入，存量直调随需求自然迁移。

## 验证护栏
- 每次拆分后必须 `npm run typecheck` 0 错 + `npm test`（smoke 1177 断言）全绿。
- 视觉回归（`test/visual-regression.cjs`）确认表现层无回归。
- 拆分 PR 保持小粒度（单 Manager / 单系统），便于 review 与回滚。
