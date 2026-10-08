import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 0006：刷新令牌支持（解决 SSO/账号登录后 JWT 7 天过期被强制重新 SSO 的问题）
 * - refresh_token_hash：SHA-256 后的刷新令牌，登录/换会话/刷新时轮换
 *   用于前端静默续期，无需反复跳 SSO 统一登录页
 */
export class XiaoxiaoleRefreshToken1760000000006 implements MigrationInterface {
  name = 'XiaoxiaoleRefreshToken1760000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE auth_accounts
      ADD COLUMN IF NOT EXISTS refresh_token_hash varchar(255) NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_accounts_refresh_token_hash
      ON auth_accounts (refresh_token_hash)
      WHERE refresh_token_hash IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_auth_accounts_refresh_token_hash
    `);
    await queryRunner.query(`
      ALTER TABLE auth_accounts
      DROP COLUMN IF EXISTS refresh_token_hash
    `);
  }
}
