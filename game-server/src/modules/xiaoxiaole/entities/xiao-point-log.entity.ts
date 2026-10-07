import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/** 消消乐积分流水（用于对账与风控） */
@Entity('xiao_point_logs')
@Index(['playerId', 'createdAt'])
export class XiaoPointLog {
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

  @Column({ name: 'ref_id', type: 'varchar', length: 64, nullable: true })
  refId: string | null;

  @Column({ name: 'balance_after', type: 'bigint', default: '0' })
  balanceAfter: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
