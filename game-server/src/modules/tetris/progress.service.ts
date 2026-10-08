import { Injectable } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { TetrisPlayerProfile } from './entities/tetris-player-profile.entity';
import { TetrisPointsService } from './points.service';
import { SaveProgressDto } from './dto/tetris.dto';

/** 签到奖励道具（按连签天数循环发放，与前端礼品顺序一致） */
const GIFTS = ['slow', 'undo', 'bomb', 'swap', 'hint', 'shield', 'coupon'];

/**
 * 方块进度档案服务（完整进度服务端持久化）
 * - bestScore / plays / 背包 items：登录后由客户端全量上报，服务端取 max 合并
 * - 签到：服务端算连签天数 + 发积分（refId 幂等），返回奖励道具供客户端落袋
 */
@Injectable()
export class TetrisProgressService {
  constructor(
    @InjectRepository(TetrisPlayerProfile)
    private readonly profileRepo: Repository<TetrisPlayerProfile>,
    private readonly points: TetrisPointsService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async getProfile(playerId: string): Promise<{
    bestScore: number;
    plays: number;
    signinStreak: number;
    lastSignDate: string;
    items: Record<string, number>;
  }> {
    const row = await this.ensureRow(playerId);
    return {
      bestScore: row.bestScore,
      plays: row.plays,
      signinStreak: row.signinStreak,
      lastSignDate: row.lastSigninDate ?? '',
      items: row.items ?? {},
    };
  }

  async saveProgress(
    playerId: string,
    dto: SaveProgressDto,
  ): Promise<{
    bestScore: number;
    plays: number;
    signinStreak: number;
    lastSignDate: string;
    items: Record<string, number>;
  }> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(TetrisPlayerProfile);
      const row = await this.ensureRow(playerId, manager);
      const bestScore = Math.max(row.bestScore, dto.bestScore ?? 0);
      const plays = Math.max(row.plays, dto.plays ?? 0);
      const signinStreak = Math.max(row.signinStreak, dto.signinStreak ?? 0);
      const items = this.mergeItems(row.items ?? {}, dto.items ?? {});
      await repo.update(
        { playerId },
        { bestScore, plays, signinStreak, items },
      );
      return {
        bestScore,
        plays,
        signinStreak,
        lastSignDate: row.lastSigninDate ?? '',
        items,
      };
    });
  }

  /**
   * 连续签到：服务端算连签天数并发积分；返回奖励道具 + 最新余额。
   * 已在今日签到则 signedToday=true 且不重复发奖。
   */
  async signin(playerId: string): Promise<{
    signedToday: boolean;
    signinStreak: number;
    rewardItem: string;
    reward: number;
    balance: number;
  }> {
    const today = dayStr(new Date());
    const base = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(TetrisPlayerProfile);
      const row = await this.ensureRow(playerId, manager);
      if (row.lastSigninDate === today) {
        return {
          signedToday: true,
          signinStreak: row.signinStreak,
          rewardItem: '',
          reward: 0,
        };
      }
      const yesterday = dayStr(new Date(Date.now() - 86400000));
      const newStreak =
        row.lastSigninDate === yesterday ? row.signinStreak + 1 : 1;
      const reward = 10 + Math.min(newStreak, 7) * 5; // 15..45
      const rewardItem = GIFTS[(newStreak - 1) % GIFTS.length];
      await repo.update(
        { playerId },
        { signinStreak: newStreak, lastSigninDate: today },
      );
      return {
        signedToday: false,
        signinStreak: newStreak,
        rewardItem,
        reward,
      };
    });

    let balance: number;
    if (!base.signedToday && base.reward > 0) {
      balance = (
        await this.points.earn(
          playerId,
          base.reward,
          'earn_daily',
          `daily:${today}`,
        )
      ).balance;
    } else {
      balance = (await this.points.getBalance(playerId)).balance;
    }
    return {
      signedToday: base.signedToday,
      signinStreak: base.signinStreak,
      rewardItem: base.rewardItem,
      reward: base.reward,
      balance,
    };
  }

  /** 合并背包：逐道具取 max，避免任何一方覆盖更优数据 */
  private mergeItems(
    a: Record<string, number>,
    b: Record<string, number>,
  ): Record<string, number> {
    const out: Record<string, number> = { ...a };
    for (const k of Object.keys(b)) out[k] = Math.max(out[k] ?? 0, b[k] ?? 0);
    return out;
  }

  private async ensureRow(
    playerId: string,
    manager?: EntityManager,
  ): Promise<TetrisPlayerProfile> {
    const repo = manager
      ? manager.getRepository(TetrisPlayerProfile)
      : this.profileRepo;
    let row = await repo.findOne({ where: { playerId } });
    if (!row) {
      await repo.insert({
        playerId,
        bestScore: 0,
        plays: 0,
        signinStreak: 0,
        lastSigninDate: null,
        items: {},
      });
      row = (await repo.findOne({ where: { playerId } }))!;
    }
    return row;
  }
}

function dayStr(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
