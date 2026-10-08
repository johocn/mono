import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 方块（tetris）数据表（tetris_ 前缀，与消消乐 xiao_ 完全隔离、积分单独核算）
 * player_id 复用 players 体系的主键（bigint）。
 *
 * 执行（部署人运行）：
 *   cd d:/zhao/game-server
 *   npm run typeorm:run
 */
export class TetrisTables1759700000007 implements MigrationInterface {
  name = 'TetrisTables1759700000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tetris_player_points" (
        "id" bigserial PRIMARY KEY,
        "player_id" bigint NOT NULL UNIQUE,
        "balance" bigint NOT NULL DEFAULT 0,
        "total_earned" bigint NOT NULL DEFAULT 0,
        "total_spent" bigint NOT NULL DEFAULT 0,
        "updated_at" timestamp NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tetris_point_logs" (
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
      `CREATE INDEX IF NOT EXISTS "idx_tetris_point_logs_player" ON "tetris_point_logs" ("player_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_tetris_point_logs_type" ON "tetris_point_logs" ("type")`,
    );
    // 幂等键：同一 (player_id, ref_id) 只记一次收入（partial index，ref_id 为空不约束）
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_tetris_point_logs_player_ref" ON "tetris_point_logs" ("player_id", "ref_id") WHERE "ref_id" IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tetris_player_profile" (
        "id" bigserial PRIMARY KEY,
        "player_id" bigint NOT NULL UNIQUE,
        "best_score" int NOT NULL DEFAULT 0,
        "plays" int NOT NULL DEFAULT 0,
        "signin_streak" int NOT NULL DEFAULT 0,
        "last_signin_date" varchar(10),
        "items" jsonb,
        "updated_at" timestamp NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tetris_player_skins" (
        "id" bigserial PRIMARY KEY,
        "player_id" bigint NOT NULL,
        "skin_id" varchar(64) NOT NULL,
        "source" varchar(16) NOT NULL DEFAULT 'points',
        "created_at" timestamp NOT NULL DEFAULT now(),
        UNIQUE ("player_id", "skin_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_tetris_player_skins_player" ON "tetris_player_skins" ("player_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "tetris_player_skins"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tetris_player_profile"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tetris_point_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tetris_player_points"`);
  }
}
