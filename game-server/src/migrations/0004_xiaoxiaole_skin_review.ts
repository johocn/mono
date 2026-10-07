import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 0004：皮肤审核流
 * - xiao_skins 增加 review_note：驳回原因（审核通过/待审核时为空）
 * - status 语义：0=下架/驳回 1=已上架 2=待审核（2 为新增取值，smallint 无需变更）
 */
export class XiaoxiaoleSkinReview1760000000004 implements MigrationInterface {
  name = 'XiaoxiaoleSkinReview1760000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE xiao_skins
      ADD COLUMN IF NOT EXISTS review_note varchar(200) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE xiao_skins
      DROP COLUMN IF EXISTS review_note
    `);
  }
}
