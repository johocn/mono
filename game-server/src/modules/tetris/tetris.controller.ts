import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { CurrentPlayer } from '@common/decorators/current-player.decorator';
import type { CurrentPlayerData } from '@common/decorators/current-player.decorator';
import { TetrisPointsService } from './points.service';
import { TetrisProgressService } from './progress.service';
import { TetrisSkinsService } from './skins.service';
import {
  EarnPointsDto,
  SaveProgressDto,
  UnlockSkinDto,
} from './dto/tetris.dto';

/**
 * 方块（tetris）客户端接口
 * 路由前缀沿用 game-server 约定：api/client/v1/tetris/*
 * 鉴权复用全局 RateLimitGuard + JwtAuthGuard；玩家身份来自 @CurrentPlayer。
 */
@ApiTags('Tetris')
@ApiBearerAuth()
@Controller()
export class TetrisController {
  constructor(
    private readonly points: TetrisPointsService,
    private readonly progress: TetrisProgressService,
    private readonly skins: TetrisSkinsService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('api/client/v1/tetris/points')
  @ApiOperation({ summary: '获取方块积分余额' })
  async getPoints(@CurrentPlayer() player: CurrentPlayerData) {
    return this.points.getBalance(player.playerId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('api/client/v1/tetris/points/earn')
  @ApiOperation({
    summary: '上报获得积分（通关/每日/广告/分享），服务端做幂等+上限保护',
  })
  async earnPoints(
    @CurrentPlayer() player: CurrentPlayerData,
    @Body() dto: EarnPointsDto,
  ) {
    return this.points.earn(player.playerId, dto.amount, dto.type, dto.refId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('api/client/v1/tetris/points/spend')
  @ApiOperation({ summary: '消费积分（兑换/解锁，服务端校验余额防超额）' })
  async spendPoints(
    @CurrentPlayer() player: CurrentPlayerData,
    @Body() dto: EarnPointsDto,
  ) {
    return this.points.spend(player.playerId, dto.amount, dto.type, dto.refId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('api/client/v1/tetris/progress')
  @ApiOperation({ summary: '获取完整进度（最高分/场次/背包/签到）' })
  async getProgress(@CurrentPlayer() player: CurrentPlayerData) {
    return this.progress.getProfile(player.playerId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('api/client/v1/tetris/progress')
  @ApiOperation({ summary: '上报/合并进度（登录后双向同步）' })
  async saveProgress(
    @CurrentPlayer() player: CurrentPlayerData,
    @Body() dto: SaveProgressDto,
  ) {
    return this.progress.saveProgress(player.playerId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('api/client/v1/tetris/signin')
  @ApiOperation({ summary: '连续签到：服务端算连签并发现金/道具' })
  async signin(@CurrentPlayer() player: CurrentPlayerData) {
    return this.progress.signin(player.playerId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('api/client/v1/tetris/skins')
  @ApiOperation({ summary: '我的已解锁皮肤列表' })
  async listSkins(@CurrentPlayer() player: CurrentPlayerData) {
    return this.skins.listUnlocked(player.playerId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('api/client/v1/tetris/skins/unlock')
  @ApiOperation({ summary: '积分兑换/解锁内置皮肤' })
  async unlockSkin(
    @CurrentPlayer() player: CurrentPlayerData,
    @Body() dto: UnlockSkinDto,
  ) {
    return this.skins.unlockByPoints(player.playerId, dto.skinId);
  }
}
