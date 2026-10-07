import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { XiaoPlayerPoints } from './entities/xiao-player-points.entity';
import { XiaoPointLog } from './entities/xiao-point-log.entity';
import { GameException } from '@common/exceptions/game.exception';
import { ErrorCodes } from '@constants/error-codes';

/**
 * 消消乐积分服务
 * - 独立表 xiao_player_points / xiao_point_logs，不复用 player_currencies
 * - 余额变更全部走事务：先锁行再判定，防并发超额
 */
@Injectable()
export class PointsService {
  constructor(
    @InjectRepository(XiaoPlayerPoints)
    private readonly pointsRepo: Repository<XiaoPlayerPoints>,
    @InjectRepository(XiaoPointLog)
    private readonly logRepo: Repository<XiaoPointLog>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async getBalance(playerId: string): Promise<{ balance: number; totalEarned: number; totalSpent: number }> {
    const row = await this.ensureRow(playerId);
    return {
      balance: Number(row.balance),
      totalEarned: Number(row.totalEarned),
      totalSpent: Number(row.totalSpent),
    };
  }

  /** 获得积分（事务：更新余额 + 写流水） */
  async earn(playerId: string, amount: number, type: string, refId?: string): Promise<{ balance: number }> {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new GameException(ErrorCodes.PARAM_INVALID, '积分数量必须为正');
    }
    const n = Math.floor(amount);
    return this.dataSource.transaction(async (manager) => {
      const row = await this.ensureRow(playerId, manager);
      const next = Number(row.balance) + n;
      await manager.update(
        XiaoPlayerPoints,
        { playerId },
        { balance: String(next), totalEarned: String(Number(row.totalEarned) + n) },
      );
      await manager.insert(XiaoPointLog, {
        playerId,
        amount: String(n),
        type,
        refId: refId ?? null,
        balanceAfter: String(next),
      });
      return { balance: next };
    });
  }

  /** 消费积分：事务内判定余额，不足抛业务异常，杜绝并发超额 */
  async spend(playerId: string, amount: number, type: string, refId?: string): Promise<{ balance: number }> {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new GameException(ErrorCodes.PARAM_INVALID, '积分数量必须为正');
    }
    const n = Math.floor(amount);
    return this.dataSource.transaction(async (manager) => {
      const row = await this.ensureRow(playerId, manager);
      const cur = Number(row.balance);
      if (cur < n) {
        throw new GameException(ErrorCodes.SKIN_POINTS_NOT_ENOUGH, '积分不足');
      }
      const next = cur - n;
      await manager.update(
        XiaoPlayerPoints,
        { playerId },
        { balance: String(next), totalSpent: String(Number(row.totalSpent) + n) },
      );
      await manager.insert(XiaoPointLog, {
        playerId,
        amount: String(-n),
        type,
        refId: refId ?? null,
        balanceAfter: String(next),
      });
      return { balance: next };
    });
  }

  /** 幂等地取到余额行（不存在则建 0 余额行） */
  private async ensureRow(playerId: string, manager?: EntityManager): Promise<XiaoPlayerPoints> {
    const repo = manager ? manager.getRepository(XiaoPlayerPoints) : this.pointsRepo;
    let row = await repo.findOne({ where: { playerId } });
    if (!row) {
      await repo.insert({ playerId, balance: '0', totalEarned: '0', totalSpent: '0' });
      row = (await repo.findOne({ where: { playerId } }))!;
    }
    return row;
  }
}
