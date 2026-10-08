import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * 方块（tetris）积分余额（每个玩家一行）
 * 独立建表而非复用 player_currencies，保证与消消乐（xiao）数据完全隔离、积分单独核算。
 */
@Entity('tetris_player_points')
@Index(['playerId'], { unique: true })
export class TetrisPlayerPoints {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'player_id', type: 'bigint' })
  playerId: string;

  @Column({ type: 'bigint', default: '0' })
  balance: string;

  @Column({ name: 'total_earned', type: 'bigint', default: '0' })
  totalEarned: string;

  @Column({ name: 'total_spent', type: 'bigint', default: '0' })
  totalSpent: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
