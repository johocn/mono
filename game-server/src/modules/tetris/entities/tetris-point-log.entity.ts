import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/** 方块积分流水（用于对账与风控；幂等靠 (player_id, ref_id) 唯一索引） */
@Entity('tetris_point_logs')
@Index(['playerId', 'createdAt'])
export class TetrisPointLog {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'player_id', type: 'bigint' })
  playerId: string;

  /** 正数为获得，负数为消费 */
  @Column({ type: 'bigint' })
  amount: string;

  /** earn_pass / earn_daily / earn_ad / earn_share / spend_redeem */
  @Index()
  @Column({ type: 'varchar', length: 32 })
  type: string;

  /** 幂等键：同一 (player_id, ref_id) 只记一次（如 daily:2026-10-08、关卡会话 id） */
  @Column({ name: 'ref_id', type: 'varchar', length: 64, nullable: true })
  refId: string | null;

  @Column({ name: 'balance_after', type: 'bigint', default: '0' })
  balanceAfter: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
