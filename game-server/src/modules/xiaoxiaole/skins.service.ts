import { Injectable } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, In, DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { XiaoSkin } from './entities/xiao-skin.entity';
import { XiaoPlayerSkin } from './entities/xiao-player-skin.entity';
import { CreateSkinDto } from './dto/create-skin.dto';
import { PointsService } from './points.service';
import { GameException } from '@common/exceptions/game.exception';
import { ErrorCodes } from '@constants/error-codes';

/** 皮肤状态：0=下架/驳回 1=已上架 2=待审核 */
const SKIN_STATUS = { OFF: 0, ON: 1, PENDING: 2 } as const;

/** 销售分成：积分购买成交额中作者入账的百分比（环境变量可调，默认 80） */
const SALE_SHARE_PCT = Math.min(100, Math.max(0, Number(process.env.XIAO_SALE_SHARE_PCT ?? 80)));

/** 适老化硬底线：棋子与棋盘底色对比度需达到 WCAG AA */
const MIN_CONTRAST = 4.5;

// === 对比度工具（与前端 SafetyManager 同算法，保证前后端判定一致） ===

function toOpaqueHex(color: string): string | null {
  const m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/.exec(color);
  if (m) {
    return (
      '#' +
      [m[1], m[2], m[3]]
        .map((v) => Math.max(0, Math.min(255, Number(v))).toString(16).padStart(2, '0'))
        .join('')
    );
  }
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(color)) {
    const [r, g, b] = color.slice(1).split('');
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
}

function relLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const ch = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function contrastRatio(fg: string, bg: string): number {
  const a = toOpaqueHex(fg);
  const b = toOpaqueHex(bg);
  if (!a || !b) return 21;
  const la = relLuminance(a);
  const lb = relLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

@Injectable()
export class SkinsService {
  constructor(
    @InjectRepository(XiaoSkin)
    private readonly skinRepo: Repository<XiaoSkin>,
    @InjectRepository(XiaoPlayerSkin)
    private readonly unlockRepo: Repository<XiaoPlayerSkin>,
    private readonly points: PointsService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // === 模板中心 ===

  /** 上架皮肤列表（公开，无需登录） */
  async listMarket(): Promise<Record<string, any>[]> {
    const rows = await this.skinRepo.find({
      where: { status: 1 },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    return rows.map((r) => this.toBrief(r));
  }

  async getDetail(skinId: string): Promise<Record<string, any>> {
    const row = await this.skinRepo.findOne({ where: { skinId, status: 1 } });
    if (!row) throw new GameException(ErrorCodes.SKIN_NOT_FOUND, '皮肤不存在或已下架');
    return {
      skinId: row.skinId,
      name: row.name,
      authorName: row.authorName,
      pricePoints: row.pricePoints,
      priceCents: row.priceCents,
      tags: row.tags,
      coverUrl: row.coverUrl,
      config: row.configJson,
      downloadCount: row.downloadCount,
    };
  }

  // === 发布与解锁 ===

  async publish(playerId: string, dto: CreateSkinDto): Promise<{ skinId: string; status: number }> {
    this.validateConfig(dto.config);
    const skinId = (dto.skinId || '').trim() || `skin_${randomUUID().slice(0, 12)}`;
    const exists = await this.skinRepo.findOne({ where: { skinId } });
    if (exists) throw new GameException(ErrorCodes.PARAM_INVALID, '皮肤 id 已存在');

    const saved = await this.skinRepo.save(
      this.skinRepo.create({
        skinId,
        name: dto.name,
        authorName: dto.authorName || '匿名',
        playerId,
        configJson: dto.config,
        coverUrl: dto.coverUrl ?? null,
        pricePoints: dto.pricePoints ?? 0,
        priceCents: dto.priceCents ?? 0,
        status: SKIN_STATUS.PENDING,
        tags: dto.tags ?? [],
        reviewNote: null,
      }),
    );
    // 作者自动拥有自己发布的皮肤（审核期间自己即可使用）
    await this.grantUnlock(playerId, skinId, 'author');
    return { skinId: saved.skinId, status: SKIN_STATUS.PENDING };
  }

  /** 管理端审核：通过 → 上架；驳回 → 下架并记录原因 */
  async review(skinId: string, approve: boolean, note?: string): Promise<{ skinId: string; status: number; reviewNote: string | null }> {
    const row = await this.skinRepo.findOne({ where: { skinId } });
    if (!row) throw new GameException(ErrorCodes.SKIN_NOT_FOUND, '皮肤不存在');
    if (!approve && !(note ?? '').trim()) {
      throw new GameException(ErrorCodes.PARAM_INVALID, '驳回必须填写原因');
    }
    const status = approve ? SKIN_STATUS.ON : SKIN_STATUS.OFF;
    const reviewNote = approve ? null : (note ?? '').trim().slice(0, 200);
    await this.skinRepo.update({ skinId }, { status, reviewNote });
    return { skinId, status, reviewNote };
  }

  /** 赠送：把自己拥有的皮肤送给好友（按登录账号名，不限次数） */
  async gift(playerId: string, skinId: string, toUsername: string): Promise<{ skinId: string; toPlayerId: string }> {
    const name = (toUsername || '').trim();
    if (!name) throw new GameException(ErrorCodes.PARAM_INVALID, '请填写好友的账号名');
    if (!(await this.hasUnlock(playerId, skinId))) {
      throw new GameException(ErrorCodes.FORBIDDEN, '只能赠送自己拥有的皮肤');
    }
    const rows: { id: string }[] = await this.dataSource.query(
      'SELECT id FROM auth_accounts WHERE username = $1 LIMIT 1',
      [name],
    );
    if (!rows?.length) throw new GameException(ErrorCodes.PLAYER_NOT_FOUND, '未找到该账号名的玩家');
    const toPlayerId = String(rows[0].id);
    if (String(toPlayerId) === String(playerId)) {
      throw new GameException(ErrorCodes.PARAM_INVALID, '不能赠送给自己');
    }
    await this.grantUnlock(toPlayerId, skinId, 'gift');
    return { skinId, toPlayerId };
  }

  /** 积分兑换（事务扣减 + 写入解锁；作者按比例获得销售分成） */
  async redeemByPoints(
    playerId: string,
    skinId: string,
  ): Promise<{ skinId: string; balance: number; authorIncome: number }> {
    const skin = await this.skinRepo.findOne({ where: { skinId, status: 1 } });
    if (!skin) throw new GameException(ErrorCodes.SKIN_NOT_FOUND, '皮肤不存在或已下架');
    if (!skin.pricePoints || skin.pricePoints <= 0) {
      throw new GameException(ErrorCodes.SKIN_NOT_PURCHASABLE, '该皮肤不支持积分兑换');
    }
    if (await this.hasUnlock(playerId, skinId)) {
      throw new GameException(ErrorCodes.SKIN_ALREADY_UNLOCKED, '已拥有该皮肤');
    }
    const before = await this.points.getBalance(playerId);
    if (before.balance < skin.pricePoints) {
      throw new GameException(ErrorCodes.SKIN_POINTS_NOT_ENOUGH, '积分不足');
    }
    const res = await this.points.spend(playerId, skin.pricePoints, 'spend_redeem', skinId);
    await this.grantUnlock(playerId, skinId, 'points');
    await this.skinRepo.increment({ skinId }, 'downloadCount', 1);
    // 销售分成：作者入账（与扣款分两笔事务，解锁与扣款优先保证买家侧完整）
    const income = Math.floor((skin.pricePoints * SALE_SHARE_PCT) / 100);
    if (income > 0) {
      await this.points.earn(String(skin.playerId), income, 'sale_income', skinId);
    }
    return { skinId, balance: res.balance, authorIncome: income };
  }

  /** 人民币购买后写入解锁（支付由 Vendure 完成，服务端只记解锁关系） */
  async unlockByRmb(playerId: string, skinId: string): Promise<{ skinId: string; already: boolean }> {
    const skin = await this.skinRepo.findOne({ where: { skinId, status: 1 } });
    if (!skin) throw new GameException(ErrorCodes.SKIN_NOT_FOUND, '皮肤不存在或已下架');
    if (await this.hasUnlock(playerId, skinId)) return { skinId, already: true };
    await this.grantUnlock(playerId, skinId, 'rmb');
    await this.skinRepo.increment({ skinId }, 'downloadCount', 1);
    return { skinId, already: false };
  }

  /** 我的皮肤 */
  async listMine(playerId: string): Promise<Record<string, any>[]> {
    const rows = await this.unlockRepo.find({
      where: { playerId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    const ids = rows.map((r) => r.skinId);
    if (ids.length === 0) return [];
    const skins = await this.skinRepo.find({ where: { skinId: In(ids) } });
    return skins.map((s) => this.toBrief(s));
  }

  // === 管理端 ===

  async setStatus(skinId: string, status: number): Promise<{ skinId: string; status: number }> {
    const row = await this.skinRepo.findOne({ where: { skinId } });
    if (!row) throw new GameException(ErrorCodes.SKIN_NOT_FOUND, '皮肤不存在');
    await this.skinRepo.update({ skinId }, { status });
    return { skinId, status };
  }

  /** 管理端列表（可按 status 过滤，默认全部，含下架） */
  async listAdmin(status?: number): Promise<Record<string, any>[]> {
    const where = status === undefined || Number.isNaN(status) ? {} : { status };
    const rows = await this.skinRepo.find({ where, order: { createdAt: 'DESC' }, take: 100 });
    return rows.map((r) => this.toBrief(r));
  }

  /** 删除自己发布的皮肤（先下架再软删除，保留审计痕迹） */
  async deleteSkin(playerId: string, skinId: string): Promise<{ skinId: string }> {
    const row = await this.skinRepo.findOne({ where: { skinId } });
    if (!row) throw new GameException(ErrorCodes.SKIN_NOT_FOUND, '皮肤不存在');
    if (String(row.playerId) !== String(playerId)) {
      throw new GameException(ErrorCodes.FORBIDDEN, '只能删除自己发布的皮肤');
    }
    await this.skinRepo.update({ skinId }, { status: 0 });
    await this.skinRepo.softDelete({ skinId });
    return { skinId };
  }

  // === 内容校验 ===

  /** 配置校验：必填字段 + 适老化对比度（不达标直接拒绝发布） */
  validateConfig(config: any): void {
    if (!config || typeof config !== 'object') {
      throw new GameException(ErrorCodes.PARAM_INVALID, '皮肤配置无效');
    }
    const colors = config?.bg?.colors;
    if (!Array.isArray(colors) || colors.length === 0) {
      throw new GameException(ErrorCodes.PARAM_INVALID, '缺少背景渐变色');
    }
    const boardBase =
      typeof config?.board?.base === 'string' ? config.board.base : 'rgba(24,26,48,0.82)';
    const tiles = config?.tiles ?? {};
    for (const [type, st] of Object.entries<any>(tiles)) {
      if (!st || typeof st.color !== 'string') continue;
      const ratio = contrastRatio(st.color, boardBase);
      if (ratio < MIN_CONTRAST) {
        throw new GameException(
          ErrorCodes.PARAM_INVALID,
          `棋子「${type}」与棋盘对比度 ${ratio.toFixed(2)}:1 低于 ${MIN_CONTRAST}:1，请调亮或调暗配色`,
        );
      }
    }
  }

  // === 内部 ===

  private async hasUnlock(playerId: string, skinId: string): Promise<boolean> {
    const row = await this.unlockRepo.findOne({ where: { playerId, skinId } });
    return !!row;
  }

  private async grantUnlock(playerId: string, skinId: string, source: string): Promise<void> {
    if (await this.hasUnlock(playerId, skinId)) return;
    await this.unlockRepo.save(this.unlockRepo.create({ playerId, skinId, source }));
  }

  private toBrief(r: XiaoSkin): Record<string, any> {
    return {
      skinId: r.skinId,
      name: r.name,
      authorName: r.authorName,
      pricePoints: r.pricePoints,
      priceCents: r.priceCents,
      tags: r.tags,
      coverUrl: r.coverUrl,
      config: r.configJson,
      downloadCount: r.downloadCount,
      status: r.status,
      reviewNote: r.reviewNote ?? null,
      createdAt: r.createdAt,
    };
  }
}
