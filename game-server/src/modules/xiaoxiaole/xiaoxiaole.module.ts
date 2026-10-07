import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SkinsController } from './skins.controller';
import { SkinsService } from './skins.service';
import { PointsService } from './points.service';
import { AiService } from './ai.service';
import { StorageService } from './storage.service';
import { XiaoSkin } from './entities/xiao-skin.entity';
import { XiaoPlayerPoints } from './entities/xiao-player-points.entity';
import { XiaoPointLog } from './entities/xiao-point-log.entity';
import { XiaoPlayerSkin } from './entities/xiao-player-skin.entity';

/**
 * 消消乐（xiaoxiaole）模块
 * 复用 game-server 的 players 用户体系与公共能力；数据表统一 xiao_ 前缀、与其他项目隔离。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([XiaoSkin, XiaoPlayerPoints, XiaoPointLog, XiaoPlayerSkin]),
  ],
  controllers: [SkinsController],
  providers: [SkinsService, PointsService, AiService, StorageService],
  exports: [SkinsService, PointsService],
})
export class XiaoxiaoleModule {}
