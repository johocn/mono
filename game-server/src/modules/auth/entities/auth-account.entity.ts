import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';
import { AccountType, AccountStatus } from '@constants/enums';

@Entity('auth_accounts')
export class AuthAccount {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  username: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 128 })
  passwordHash: string;

  @Column({ name: 'account_type', type: 'enum', enum: AccountType, default: AccountType.NORMAL })
  accountType: AccountType;

  @Column({ name: 'device_id', type: 'varchar', length: 255, nullable: true })
  deviceId: string | null;

  @Column({ name: 'bind_phone', type: 'varchar', length: 20, nullable: true })
  bindPhone: string | null;

  @Column({ name: 'bind_email', type: 'varchar', length: 128, nullable: true })
  bindEmail: string | null;

  @Column({ name: 'ban_reason', type: 'varchar', length: 255, nullable: true })
  banReason: string | null;

  @Column({ name: 'ban_expire_at', type: 'timestamp', nullable: true })
  banExpireAt: Date | null;

  @Column({ name: 'token_version', type: 'int', default: 0 })
  tokenVersion: number;

  /** 刷新令牌哈希（SHA-256）：登录/SSO 换会话/刷新时轮换，用于离线续期避免反复跳 SSO */
  @Column({ name: 'refresh_token_hash', type: 'varchar', length: 255, nullable: true })
  refreshTokenHash: string | null;

  /** SSO 用户唯一键（/v1/user/me 的 uuid 字段），SSO 登录对齐用 */
  @Column({ name: 'sso_uuid', type: 'varchar', length: 64, nullable: true })
  ssoUuid: string | null;

  /** SSO 用户数字自增 id 的字符串形式（对齐 nshop ssoId 语义，原样复建不补位） */
  @Column({ name: 'sso_user_id', type: 'varchar', length: 20, nullable: true })
  ssoUserId: string | null;

  /** 本人自有邀请码（/v1/user/me 的 ownInviteCode，分享链接携带） */
  @Column({ name: 'invite_code', type: 'varchar', length: 32, nullable: true })
  inviteCode: string | null;

  @Column({ name: 'last_login_at', type: 'timestamp', nullable: true })
  lastLoginAt: Date | null;

  @Column({ type: 'enum', enum: AccountStatus, default: AccountStatus.ACTIVE })
  status: AccountStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
