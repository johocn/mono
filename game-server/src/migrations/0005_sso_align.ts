import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 0005：SSO 统一登录对齐（参照 nshop / vendure cjk-plugin 对齐方法）
 * - sso_uuid：SSO 用户唯一键（/v1/user/me 返回 uuid 字段），全表唯一（NULL 不参与）
 * - sso_user_id：SSO 用户数字自增 id 的字符串形式（对齐 nshop ssoId 语义，原样复建不补位）
 * - invite_code：本人自有邀请码（/v1/user/me 的 ownInviteCode，分享链接用）
 */
export class XiaoxiaoleSsoAlign1760000000005 implements MigrationInterface {
  name = 'XiaoxiaoleSsoAlign1760000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE auth_accounts
      ADD COLUMN IF NOT EXISTS sso_uuid varchar(64) NULL,
      ADD COLUMN IF NOT EXISTS sso_user_id varchar(20) NULL,
      ADD COLUMN IF NOT EXISTS invite_code varchar(32) NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_accounts_sso_uuid
      ON auth_accounts (sso_uuid)
      WHERE sso_uuid IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_auth_accounts_sso_uuid
    `);
    await queryRunner.query(`
      ALTER TABLE auth_accounts
      DROP COLUMN IF EXISTS sso_uuid,
      DROP COLUMN IF EXISTS sso_user_id,
      DROP COLUMN IF EXISTS invite_code
    `);
  }
}
