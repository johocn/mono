import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { AuthAccount } from './entities/auth-account.entity';
import { AccountLoginLog } from './entities/account-login-log.entity';
import { PlayerService } from '@modules/player/player.service';
import { GameException } from '@common/exceptions/game.exception';
import { ErrorCodes } from '@constants/error-codes';
import { AccountType, AccountStatus } from '@constants/enums';

export interface JwtPayload {
  accountId: string;
  playerId: string;
  tokenVersion: number;
  type: 'player';
}

export interface AuthResult {
  token: string;
  accountId: string;
  playerId: string;
}

@Injectable()
export class AuthService {
  private readonly jwtSecret: string;
  private readonly jwtExpiresIn: string;

  constructor(
    @InjectRepository(AuthAccount) private readonly accountRepo: Repository<AuthAccount>,
    @InjectRepository(AccountLoginLog) private readonly loginLogRepo: Repository<AccountLoginLog>,
    private readonly playerService: PlayerService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    const jwtConfig = this.configService.get('jwt');
    this.jwtSecret = jwtConfig?.secret ?? 'default-secret';
    this.jwtExpiresIn = jwtConfig?.expiresIn ?? '7d';
  }

  /** 设备信息钳制：device_id 列宽 255，guest/sso-exchange 会以 user-agent 兜底（可超 250），入库前截断防 500 */
  private clampDevice(v?: string | null): string | null {
    return v ? v.slice(0, 250) : null;
  }

  async register(username: string, password: string, nickname: string, deviceId?: string): Promise<AuthResult> {
    const existing = await this.accountRepo.findOne({ where: { username } });
    if (existing) {
      throw new GameException(ErrorCodes.USERNAME_ALREADY_EXISTS, '用户名已存在');
    }

    const passwordHash = await this.hashPassword(password);
    const account = this.accountRepo.create({
      username,
      passwordHash,
      accountType: AccountType.NORMAL,
      deviceId: this.clampDevice(deviceId),
      tokenVersion: 0,
      status: AccountStatus.ACTIVE,
    });
    const savedAccount = await this.accountRepo.save(account);
    const player = await this.playerService.createPlayer(savedAccount.id, nickname);
    const token = this.generateToken(savedAccount.id, player.id, savedAccount.tokenVersion);

    return { token, accountId: savedAccount.id, playerId: player.id };
  }

  async login(username: string, password: string, loginIp: string, deviceInfo?: string): Promise<AuthResult> {
    const account = await this.accountRepo.findOne({ where: { username } });
    if (!account) {
      await this.recordLoginLog(null, loginIp, deviceInfo, 'fail');
      throw new GameException(ErrorCodes.ACCOUNT_NOT_FOUND, '账号不存在');
    }

    if (account.status === AccountStatus.BANNED) {
      if (!account.banExpireAt || account.banExpireAt > new Date()) {
        throw new GameException(ErrorCodes.ACCOUNT_BANNED, '账号已被封禁', {
          banReason: account.banReason, banExpireAt: account.banExpireAt,
        });
      }
      await this.accountRepo.update({ id: account.id }, { status: AccountStatus.ACTIVE, banReason: null, banExpireAt: null });
      account.status = AccountStatus.ACTIVE;
    }

    const isPasswordValid = await this.comparePassword(password, account.passwordHash);
    if (!isPasswordValid) {
      await this.recordLoginLog(account.id, loginIp, deviceInfo, 'fail');
      throw new GameException(ErrorCodes.ACCOUNT_PASSWORD_WRONG, '密码错误');
    }

    const player = await this.playerService.getByAccountId(account.id);
    if (!player) {
      throw new GameException(ErrorCodes.PLAYER_NOT_FOUND, '玩家档案不存在');
    }

    const newTokenVersion = account.tokenVersion + 1;
    await this.accountRepo.update({ id: account.id }, { tokenVersion: newTokenVersion, lastLoginAt: new Date() });
    await this.recordLoginLog(account.id, loginIp, deviceInfo, 'success');

    const token = this.generateToken(account.id, player.id, newTokenVersion);
    return { token, accountId: account.id, playerId: player.id };
  }

  async createGuest(loginIp: string, deviceInfo?: string): Promise<AuthResult> {
    const guestUsername = `guest_${randomUUID().slice(0, 12)}`;
    const guestPassword = randomUUID();
    const nickname = `Guest_${randomUUID().slice(0, 6)}`;

    const passwordHash = await this.hashPassword(guestPassword);
    const account = this.accountRepo.create({
      username: guestUsername, passwordHash, accountType: AccountType.GUEST,
      deviceId: this.clampDevice(deviceInfo), tokenVersion: 0, status: AccountStatus.ACTIVE,
    });
    const savedAccount = await this.accountRepo.save(account);
    const player = await this.playerService.createPlayer(savedAccount.id, nickname);
    await this.recordLoginLog(savedAccount.id, loginIp, deviceInfo, 'success');
    const token = this.generateToken(savedAccount.id, player.id, savedAccount.tokenVersion);

    return { token, accountId: savedAccount.id, playerId: player.id };
  }

  async validateToken(payload: JwtPayload): Promise<boolean> {
    const account = await this.accountRepo.findOne({ where: { id: payload.accountId } });
    if (!account) return false;
    if (account.status === AccountStatus.BANNED) return false;
    if (account.tokenVersion !== payload.tokenVersion) return false;
    return true;
  }

  /**
   * SSO 统一登录换会话（对齐 nshop / vendure cjk-plugin 的对齐方法）：
   * 1. accessToken 直验：GET {SSO_API_BASE}/v1/user/me（Bearer），取 uuid/nickname/ownInviteCode
   * 2. 用户对齐：auth_accounts.sso_uuid 幂等映射——已有绑定直接登录，无绑定则建档
   * 3. 游客认领：可选 claimAccountId，把本机原游客账号挂到 SSO 用户名下（进度/积分/皮肤无缝延续）
   * 4. sso_user_id 复建 SSO 数字自增 id（字符串，原样不补位）；invite_code 存本人自有码
   */
  async ssoExchange(
    accessToken: string,
    claimAccountId: string | undefined,
    loginIp: string,
    deviceInfo?: string,
  ): Promise<AuthResult & { ownInviteCode: string | null; nickname: string | null; claimed: boolean }> {
    const ssoUser = await this.fetchSsoUserInfo(accessToken);

    // 已绑定账号：直接登录
    let account = await this.accountRepo.findOne({ where: { ssoUuid: ssoUser.uuid } });
    let claimed = false;

    if (!account && claimAccountId) {
      // 游客认领：仅当目标账号存在、未封禁、且未绑定过其他 SSO 用户
      const candidate = await this.accountRepo.findOne({ where: { id: claimAccountId } });
      if (candidate && candidate.status !== AccountStatus.BANNED && !candidate.ssoUuid) {
        candidate.ssoUuid = ssoUser.uuid;
        candidate.ssoUserId = ssoUser.numericId;
        if (!candidate.inviteCode) candidate.inviteCode = ssoUser.ownInviteCode;
        if (candidate.accountType === AccountType.GUEST) candidate.accountType = AccountType.NORMAL;
        await this.accountRepo.update(
          { id: candidate.id },
          {
            ssoUuid: candidate.ssoUuid,
            ssoUserId: candidate.ssoUserId,
            inviteCode: candidate.inviteCode,
            accountType: candidate.accountType,
            lastLoginAt: new Date(),
          },
        );
        account = candidate;
        claimed = true;
      }
    }

    if (!account) {
      // 首次 SSO 登录：新建账号（username 派生自 SSO 数字 id，密码随机不可登录）
      const username = `sso_${ssoUser.numericId || ssoUser.uuid.slice(0, 12)}`;
      // 理论上 username 唯一；万一撞名（极小概率）追加随机后缀重试一次
      let usernameFinal = username;
      if (await this.accountRepo.findOne({ where: { username } })) {
        usernameFinal = `${username}_${randomUUID().slice(0, 6)}`;
      }
      const passwordHash = await this.hashPassword(randomUUID());
      account = this.accountRepo.create({
        username: usernameFinal,
        passwordHash,
        accountType: AccountType.NORMAL,
        deviceId: this.clampDevice(deviceInfo),
        tokenVersion: 0,
        status: AccountStatus.ACTIVE,
        ssoUuid: ssoUser.uuid,
        ssoUserId: ssoUser.numericId,
        inviteCode: ssoUser.ownInviteCode,
      });
      account = await this.accountRepo.save(account);
      await this.playerService.createPlayer(account.id, ssoUser.nickname || `玩家${ssoUser.numericId || ''}`);
    }

    const player = await this.playerService.getByAccountId(account.id);
    if (!player) {
      throw new GameException(ErrorCodes.PLAYER_NOT_FOUND, '玩家档案不存在');
    }

    const newTokenVersion = account.tokenVersion + 1;
    await this.accountRepo.update({ id: account.id }, { tokenVersion: newTokenVersion, lastLoginAt: new Date() });
    await this.recordLoginLog(account.id, loginIp, deviceInfo, 'success');

    const token = this.generateToken(account.id, player.id, newTokenVersion);
    return {
      token,
      accountId: account.id,
      playerId: player.id,
      ownInviteCode: account.inviteCode ?? ssoUser.ownInviteCode,
      nickname: ssoUser.nickname,
      claimed,
    };
  }

  /** 调 SSO 服务直验 accessToken 并归一化用户信息（对齐 nshop：uuid 唯一键 + 数字 id + ownInviteCode） */
  private async fetchSsoUserInfo(accessToken: string): Promise<{
    uuid: string;
    numericId: string;
    nickname: string | null;
    ownInviteCode: string | null;
  }> {
    const base = (this.configService.get<string>('sso.apiBase') ?? process.env.SSO_API_BASE ?? 'https://h.joho.cn/api/zhao-sso').replace(/\/$/, '');
    let res: Response;
    try {
      res = await fetch(`${base}/v1/user/me`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new GameException(ErrorCodes.TOKEN_INVALID, 'SSO 服务不可用，请稍后重试');
    }
    if (!res.ok) {
      throw new GameException(ErrorCodes.TOKEN_INVALID, 'SSO 登录已过期，请重新登录');
    }
    const data: any = await res.json().catch(() => null);
    const user = data?.data ?? data?.user ?? data;
    const rawUuid = typeof user?.uuid === 'string' && user.uuid ? user.uuid : '';
    const numericId = user?.id !== undefined && user?.id !== null ? String(user.id) : '';
    // uuid 缺失时用数字 id 派生稳定唯一键（id_N 永不与真实 uuid 冲突）
    const finalUuid = rawUuid || (numericId ? `id_${numericId}` : '');
    if (!finalUuid) {
      throw new GameException(ErrorCodes.TOKEN_INVALID, 'SSO 用户信息异常，请重新登录');
    }
    return {
      uuid: finalUuid,
      numericId,
      nickname: typeof user?.nickname === 'string' && user.nickname ? user.nickname : null,
      ownInviteCode: typeof user?.ownInviteCode === 'string' && user.ownInviteCode ? user.ownInviteCode : null,
    };
  }

  async getAccountById(accountId: string): Promise<AuthAccount | null> {
    return this.accountRepo.findOne({ where: { id: accountId } });
  }

  private generateToken(accountId: string, playerId: string, tokenVersion: number): string {
    const payload: JwtPayload = { accountId, playerId, tokenVersion, type: 'player' };
    return this.jwtService.sign(payload, {
      secret: this.jwtSecret,
      expiresIn: this.jwtExpiresIn,
    } as JwtSignOptions);
  }

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  private async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  private async recordLoginLog(accountId: string | null, loginIp: string, deviceInfo: string | undefined, result: 'success' | 'fail'): Promise<void> {
    const log = this.loginLogRepo.create({
      accountId: accountId ?? '0', loginIp, deviceInfo: this.clampDevice(deviceInfo), loginResult: result,
    });
    await this.loginLogRepo.save(log);
  }
}
