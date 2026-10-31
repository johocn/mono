/**
 * 轻量事件总线（LayaAir 无内置全局事件总线）。
 * 用途：解耦 Game.ts / Player.ts 上帝类中的跨系统直调，逐步用事件替代硬引用。
 * 渐进式接入：新增系统优先走 bus.emit/on；存量直调按需迁移，不一次性重写。
 *
 * 约定（来自架构治理清单）：
 *  - 事件名统一用 GameEvent 常量，禁止裸字符串；
 *  - payload 用结构化对象，避免位置参数。
 */
export type GameEvent =
  // 玩家状态
  | "player:stateChanged"
  | "player:levelUp"
  | "player:death"
  | "player:hpChanged"
  // 战斗
  | "combat:hit"
  | "combat:skillCast"
  // 经济 / 背包
  | "inventory:changed"
  | "currency:changed"
  // UI
  | "ui:open"
  | "ui:close"
  // 地图
  | "map:teleport"
  // 存档
  | "save:request";

type Handler = (payload?: unknown) => void;

class EventBus {
  private handlers = new Map<GameEvent, Set<Handler>>();

  on(event: GameEvent, handler: Handler): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
    return () => this.off(event, handler);
  }

  off(event: GameEvent, handler: Handler): void {
    this.handlers.get(event)?.delete(handler);
  }

  emit(event: GameEvent, payload?: unknown): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const h of [...set]) {
      try {
        h(payload);
      } catch (e) {
        console.error(`[EventBus] handler error for ${event}:`, e);
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}

/** 全局单例总线（参照 indie-blueprint 的 autoload 单例范式） */
export const bus = new EventBus();
