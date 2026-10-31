import { LocalStorage } from "./Storage";
import { CloudClient } from "./CloudClient";

/**
 * 存档管理器：收敛「云优先 + 本地兜底」策略，替代 Game.ts 中散落的
 * LocalStorage / CloudClient 直调。无状态（token 由调用方持有），便于渐进迁移，
 * 不影响社交/排行榜等对 CloudClient 的其他用途。
 */
export class SaveManager {
  private cloud = new CloudClient();

  /** 游客登录，返回 token（null 表示离线，不影响单机可玩） */
  async login(nickname: string): Promise<string | null> {
    const r = await this.cloud.login(nickname);
    return r?.token || null;
  }

  /** 读档：云优先，失败回退本地（续玩时调用） */
  async load(token: string | null): Promise<any | null> {
    let data: any = token ? await this.cloud.load(token) : null;
    if (!data) data = LocalStorage.read();
    return data;
  }

  /** 存档：本地兜底先写，云并存（尽力，离线静默） */
  save(token: string | null, data: unknown): void {
    LocalStorage.write(data);
    if (token) void this.cloud.save(token, data);
  }
}
