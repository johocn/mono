import { Injectable } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { TetrisPlayerPoints } from './entities/tetris-player-points.entity';
import { TetrisPointLog } from './entities/tetris-point-log.entity';
import { GameException } from '@common/exceptions/game.exception';
import { ErrorCodes } from '@constants/error-codes';

/**
 * 方块（tetris）独立积分账本
 * - 独立表 tetris_player_points / tetris_point_logs，与消消乐（xiao）互不相通
 * - 余额变更全部走事务（先判定再更新），防并发超额
 * - refId 幂等：同一 (player_id, ref_id) 只记一次（双保险：服务层预查 + 库唯一索引）
 * - 按 type 的每日上限：防刷分（earn_pass 等靠 refId 幂等，不额外限制）
 */
@Injectable()
export class TetrisPointsService {
  constructor(
    @InjectRepository(TetrisPlayerPoints)
    private readonly pointsRepo: Repository<TetrisPlayerPoints>,
    @InjectRepository(TetrisPointLog)
    private readonly logRepo: Repository<TetrisPointLog>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async getBalance(
    playerId: string,
  ): Promise<{ balance: number; totalEarned: number; totalSpent: number }> {
    const row = await this.ensureRow(playerId);
    return {
      balance: Number(row.balance),
      totalEarned: Number(row.totalEarned),
      totalSpent: Number(row.totalSpent),
    };
  }

  /** 获得积分（事务：更新余额 + 写流水；含 refId 幂等 + 每日上限） */
  async earn(
    playerId: string,
    amount: number,
    type: string,
    refId?: string,
  ): Promise<{ balance: number }> {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new GameException(ErrorCodes.PARAM_INVALID, '积分数量必须为正');
    }
    const requested = Math.floor(amount);
    return this.dataSource.transaction(async (manager) => {
      const row = await this.ensureRow(playerId, manager);
      // 幂等：同一 (player_id, ref_id) 只记一次
      if (refId) {
        const dup = await manager.findOne(TetrisPointLog, {
          where: { playerId, refId },
        });
        if (dup) return { balance: Number(row.balance) };
      }
      // 每日上限保护（如看广告 / 分享）
      let grant = requested;
      const cap = DAILY_CAP_BY_TYPE[type];
      if (cap !== undefined) {
        const used = await this.todayUsed(manager, playerId, type);
        const remaining = cap - used;
        if (remaining <= 0) return { balance: Number(row.balance) };
        grant = Math.min(requested, remaining);
      }
      const next = Number(row.balance) + grant;
      await manager.update(
        TetrisPlayerPoints,
        { playerId },
        {
          balance: String(next),
          totalEarned: String(Number(row.totalEarned) + grant),
        },
      );
      await manager.insert(TetrisPointLog, {
        playerId,
        amount: String(grant),
        type,
        refId: refId ?? null,
        balanceAfter: String(next),
      });
      return { balance: next };
    });
  }

  /** 消费积分：事务内判定余额，不足抛业务异常，杜绝并发超额 */
  async spend(
    playerId: string,
    amount: number,
    type: string,
    refId?: string,
  ): Promise<{ balance: number }> {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new GameException(ErrorCodes.PARAM_INVALID, '积分数量必须为正');
    }
    const n = Math.floor(amount);
    return this.dataSource.transaction(async (manager) => {
      const row = await this.ensureRow(playerId, manager);
      // 幂等：如皮肤兑换（refId=skinId），重复点击不会重复扣
      if (refId) {
        const dup = await manager.findOne(TetrisPointLog, {
          where: { playerId, refId },
        });
        if (dup) return { balance: Number(row.balance) };
      }
      const cur = Number(row.balance);
      if (cur < n) {
        throw new GameException(ErrorCodes.SKIN_POINTS_NOT_ENOUGH, '积分不足');
      }
      const next = cur - n;
      await manager.update(
        TetrisPlayerPoints,
        { playerId },
        {
          balance: String(next),
          totalSpent: String(Number(row.totalSpent) + n),
        },
      );
      await manager.insert(TetrisPointLog, {
        playerId,
        amount: String(-n),
        type,
        refId: refId ?? null,
        balanceAfter: String(next),
      });
      return { balance: next };
    });
  }

  /** 当日该类型已发放总量（用于每日上限判定） */
  private async todayUsed(
    manager: EntityManager,
    playerId: string,
    type: string,
  ): Promise<number> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const rows: { sum: string | null }[] = await manager.query(
      'SELECT COALESCE(SUM(CAST(amount AS bigint)), 0)::text AS sum FROM tetris_point_logs WHERE player_id = $1 AND type = $2 AND created_at >= $3',
      [playerId, type, start],
    );
    return Number(rows[0]?.sum ?? 0);
  }

  /** 幂等地取到余额行（不存在则建 0 余额行） */
  private async ensureRow(
    playerId: string,
    manager?: EntityManager,
  ): Promise<TetrisPlayerPoints> {
    const repo = manager
      ? manager.getRepository(TetrisPlayerPoints)
      : this.pointsRepo;
    let row = await repo.findOne({ where: { playerId } });
    if (!row) {
      await repo.insert({
        playerId,
        balance: '0',
        totalEarned: '0',
        totalSpent: '0',
      });
      row = (await repo.findOne({ where: { playerId } }))!;
    }
    return row;
  }
}

/** 各 earn 类型的每日获取上限（防刷分）。earn_pass 等靠 refId 幂等即可，不在此限制。 */
const DAILY_CAP_BY_TYPE: Record<string, number> = {
  earn_ad: 500,
  earn_share: 200,
};
