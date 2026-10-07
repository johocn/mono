import {
  Body,
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { AdminGuard } from '@common/guards/admin.guard';
import { Public } from '@common/decorators/public.decorator';
import { CurrentPlayer } from '@common/decorators/current-player.decorator';
import type { CurrentPlayerData } from '@common/decorators/current-player.decorator';
import { SkinsService } from './skins.service';
import { PointsService } from './points.service';
import { AiService } from './ai.service';
import { StorageService } from './storage.service';
import { CreateSkinDto } from './dto/create-skin.dto';
import { GiftSkinDto } from './dto/gift-skin.dto';
import { EarnPointsDto, RedeemSkinDto } from './dto/points.dto';

/** 单个素材体积上限（与 StorageService 保持一致） */
const UPLOAD_LIMIT_BYTES = 2 * 1024 * 1024;

@ApiTags('Xiaoxiaole')
@ApiBearerAuth()
@Controller()
export class SkinsController {
  constructor(
    private readonly skins: SkinsService,
    private readonly points: PointsService,
    private readonly ai: AiService,
    private readonly storage: StorageService,
  ) {}

  // ===== Client =====

  @UseGuards(JwtAuthGuard)
  @Get('api/client/v1/xiao/points')
  @ApiOperation({ summary: '获取积分余额' })
  async getPoints(@CurrentPlayer() player: CurrentPlayerData) {
    return this.points.getBalance(player.playerId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('api/client/v1/xiao/points/earn')
  @ApiOperation({ summary: '上报获得积分（通关/每日/广告/分享），服务端做上限保护' })
  async earnPoints(@CurrentPlayer() player: CurrentPlayerData, @Body() dto: EarnPointsDto) {
    return this.points.earn(player.playerId, dto.amount, dto.type, dto.refId);
  }

  @Public()
  @Get('api/client/v1/xiao/skins/prompt-templates')
  @ApiOperation({ summary: 'AI 提示词模板 + 制作规格（公开，复制后到外部 AI 工具做图）' })
  async promptTemplates() {
    return this.ai.templates();
  }

  @Public()
  @Get('api/client/v1/xiao/skins/market')
  @ApiOperation({ summary: '模板中心皮肤列表（公开）' })
  async market() {
    return this.skins.listMarket();
  }

  @UseGuards(JwtAuthGuard)
  @Get('api/client/v1/xiao/skins/mine')
  @ApiOperation({ summary: '我的皮肤' })
  async mine(@CurrentPlayer() player: CurrentPlayerData) {
    return this.skins.listMine(player.playerId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('api/client/v1/xiao/skins/publish')
  @ApiOperation({ summary: '发布皮肤到模板中心' })
  async publish(@CurrentPlayer() player: CurrentPlayerData, @Body() dto: CreateSkinDto) {
    return this.skins.publish(player.playerId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('api/client/v1/xiao/skins/redeem')
  @ApiOperation({ summary: '积分兑换皮肤' })
  async redeem(@CurrentPlayer() player: CurrentPlayerData, @Body() dto: RedeemSkinDto) {
    return this.skins.redeemByPoints(player.playerId, dto.skinId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('api/client/v1/xiao/skins/unlock-rmb')
  @ApiOperation({ summary: '人民币购买后写入解锁（支付由 Vendure 完成）' })
  async unlockRmb(@CurrentPlayer() player: CurrentPlayerData, @Body() dto: RedeemSkinDto) {
    return this.skins.unlockByRmb(player.playerId, dto.skinId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('api/client/v1/xiao/skins/upload')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '上传皮肤素材（png/jpg/webp，≤2MB）' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: UPLOAD_LIMIT_BYTES, files: 1 },
    }),
  )
  async upload(@UploadedFile() file: any) {
    return this.storage.saveImage(file);
  }

  @UseGuards(JwtAuthGuard)
  @Post('api/client/v1/xiao/skins/gift')
  @ApiOperation({ summary: '赠送自己拥有的皮肤给好友（按登录账号名，不限次）' })
  async gift(@CurrentPlayer() player: CurrentPlayerData, @Body() dto: GiftSkinDto) {
    return this.skins.gift(player.playerId, dto.skinId, dto.toUsername);
  }

  /** 注意：通配路由必须定义在上方具体路由之后 */
  @Public()
  @Get('api/client/v1/xiao/skins/:skinId')
  @ApiOperation({ summary: '皮肤详情' })
  async detail(@Param('skinId') skinId: string) {
    return this.skins.getDetail(skinId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('api/client/v1/xiao/skins/:skinId')
  @ApiOperation({ summary: '删除自己发布的皮肤' })
  async deleteSkin(@CurrentPlayer() player: CurrentPlayerData, @Param('skinId') skinId: string) {
    return this.skins.deleteSkin(player.playerId, skinId);
  }

  // ===== Admin =====

  @UseGuards(AdminGuard)
  @Get('api/admin/v1/xiao/skins')
  @ApiOperation({ summary: '[管理] 皮肤列表（可按 status 过滤，默认全部）' })
  async listAdmin(@Query('status') status?: string) {
    return this.skins.listAdmin(status === undefined ? undefined : Number(status));
  }

  @UseGuards(AdminGuard)
  @Post('api/admin/v1/xiao/skins/:skinId/status')
  @ApiOperation({ summary: '[管理] 上架/下架皮肤（1=上架 0=下架）' })
  async setStatus(@Param('skinId') skinId: string, @Body() body: { status: number }) {
    return this.skins.setStatus(skinId, Number(body?.status ?? 0));
  }

  @UseGuards(AdminGuard)
  @Post('api/admin/v1/xiao/skins/:skinId/review')
  @ApiOperation({ summary: '[管理] 审核皮肤：approve=true 上架 / false 驳回（note 必填原因）' })
  async review(
    @Param('skinId') skinId: string,
    @Body() body: { approve: boolean; note?: string },
  ) {
    return this.skins.review(skinId, Boolean(body?.approve), body?.note);
  }
}
