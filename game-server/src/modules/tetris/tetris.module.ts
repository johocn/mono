import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TetrisController } from './tetris.controller';
import { TetrisPointsService } from './points.service';
import { TetrisProgressService } from './progress.service';
import { TetrisSkinsService } from './skins.service';
import { TetrisPlayerPoints } from './entities/tetris-player-points.entity';
import { TetrisPointLog } from './entities/tetris-point-log.entity';
import { TetrisPlayerProfile } from './entities/tetris-player-profile.entity';
import { TetrisPlayerSkin } from './entities/tetris-player-skin.entity';

/**
 * 方块（tetris）模块
 * 复用 game-server 的 players 用户体系与公共能力；数据表统一 tetris_ 前缀，
 * 与消消乐（xiao）完全隔离、积分单独核算。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      TetrisPlayerPoints,
      TetrisPointLog,
      TetrisPlayerProfile,
      TetrisPlayerSkin,
    ]),
  ],
  controllers: [TetrisController],
  providers: [TetrisPointsService, TetrisProgressService, TetrisSkinsService],
  exports: [TetrisPointsService, TetrisProgressService, TetrisSkinsService],
})
export class TetrisModule {}
