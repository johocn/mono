import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 消消乐皮肤系统表（xiao_ 前缀，与 game-server 其他项目数据隔离）
 * player_id 复用 players 体系的主键（bigint）。
 */
export class XiaoxiaoleSkins1759600000003 implements MigrationInterface {
  name = 'XiaoxiaoleSkins1759600000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "xiao_skins" (
        "id" bigserial PRIMARY KEY,
        "skin_id" varchar(64) NOT NULL UNIQUE,
        "name" varchar(64) NOT NULL,
        "author_name" varchar(64) NOT NULL DEFAULT '匿名',
        "player_id" bigint NOT NULL,
        "config_json" jsonb NOT NULL,
        "cover_url" varchar(512),
        "price_points" int NOT NULL DEFAULT 0,
        "price_cents" int NOT NULL DEFAULT 0,
        "status" smallint NOT NULL DEFAULT 1,
        "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "download_count" int NOT NULL DEFAULT 0,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        "deleted_at" timestamp
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_xiao_skins_status" ON "xiao_skins" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_xiao_skins_player" ON "xiao_skins" ("player_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "xiao_player_points" (
        "id" bigserial PRIMARY KEY,
        "player_id" bigint NOT NULL UNIQUE,
        "balance" bigint NOT NULL DEFAULT 0,
        "total_earned" bigint NOT NULL DEFAULT 0,
        "total_spent" bigint NOT NULL DEFAULT 0,
        "updated_at" timestamp NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "xiao_point_logs" (
        "id" bigserial PRIMARY KEY,
        "player_id" bigint NOT NULL,
        "amount" bigint NOT NULL,
        "type" varchar(32) NOT NULL,
        "ref_id" varchar(64),
        "balance_after" bigint NOT NULL DEFAULT 0,
        "created_at" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_xiao_point_logs_player" ON "xiao_point_logs" ("player_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_xiao_point_logs_type" ON "xiao_point_logs" ("type")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "xiao_player_skins" (
        "id" bigserial PRIMARY KEY,
        "player_id" bigint NOT NULL,
        "skin_id" varchar(64) NOT NULL,
        "source" varchar(16) NOT NULL DEFAULT 'points',
        "created_at" timestamp NOT NULL DEFAULT now(),
        UNIQUE ("player_id", "skin_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_xiao_player_skins_player" ON "xiao_player_skins" ("player_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "xiao_player_skins"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "xiao_point_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "xiao_player_points"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "xiao_skins"`);
  }
}
