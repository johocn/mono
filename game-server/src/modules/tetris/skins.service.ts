import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TetrisPlayerSkin } from './entities/tetris-player-skin.entity';
import { TetrisPointsService } from './points.service';
import { GameException } from '@common/exceptions/game.exception';
import { ErrorCodes } from '@constants/error-codes';

/**
 * 方块内置皮肤服务（无市场 / 上传 / 审核，比消消乐精简）
 * 内置目录的价格在服务端校验，避免前端篡改价格白嫖解锁。
 */
@Injectable()
export class TetrisSkinsService {
  constructor(
    @InjectRepository(TetrisPlayerSkin)
    private readonly unlockRepo: Repository<TetrisPlayerSkin>,
    private readonly points: TetrisPointsService,
  ) {}

  /** 内置皮肤目录：pricePoints=0 表示默认免费解锁 */
  static readonly BUILTIN_SKINS: Record<string, number> = {
    classic: 0,
    retro: 30,
    nostalgia: 30,
    warm: 0,
  };

  async listUnlocked(playerId: string): Promise<string[]> {
    const rows = await this.unlockRepo.find({ where: { playerId } });
    return rows.map((r) => r.skinId);
  }

  /** 积分兑换 / 免费解锁内置皮肤（服务端校验价格 + 扣积分 + 写解锁） */
  async unlockByPoints(
    playerId: string,
    skinId: string,
  ): Promise<{ skinId: string; already: boolean; balance: number }> {
    if (!(skinId in TetrisSkinsService.BUILTIN_SKINS)) {
      throw new GameException(ErrorCodes.SKIN_NOT_FOUND, '皮肤不存在');
    }
    if (await this.hasUnlock(playerId, skinId)) {
      const b = await this.points.getBalance(playerId);
      return { skinId, already: true, balance: b.balance };
    }
    const price = TetrisSkinsService.BUILTIN_SKINS[skinId];
    if (price > 0) {
      await this.points.spend(
        playerId,
        price,
        'spend_redeem',
        `skin:${skinId}`,
      );
    }
    await this.grantUnlock(playerId, skinId, price > 0 ? 'points' : 'default');
    const balance = (await this.points.getBalance(playerId)).balance;
    return { skinId, already: false, balance };
  }

  private async hasUnlock(playerId: string, skinId: string): Promise<boolean> {
    return !!(await this.unlockRepo.findOne({ where: { playerId, skinId } }));
  }

  private async grantUnlock(
    playerId: string,
    skinId: string,
    source: string,
  ): Promise<void> {
    if (await this.hasUnlock(playerId, skinId)) return;
    await this.unlockRepo.save(
      this.unlockRepo.create({ playerId, skinId, source }),
    );
  }
}
