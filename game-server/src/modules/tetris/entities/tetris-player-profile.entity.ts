import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * 方块玩家进度档案（完整进度服务端持久化，跨设备）
 * 背包 items 以 JSON 存储，MVP 阶段不单独建表。
 */
@Entity('tetris_player_profile')
@Index(['playerId'], { unique: true })
export class TetrisPlayerProfile {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'player_id', type: 'bigint' })
  playerId: string;

  @Column({ name: 'best_score', type: 'int', default: 0 })
  bestScore: number;

  @Column({ type: 'int', default: 0 })
  plays: number;

  /** 连续签到天数（7 天循环） */
  @Column({ name: 'signin_streak', type: 'int', default: 0 })
  signinStreak: number;

  /** 最近签到日期 yyyy-mm-dd */
  @Column({
    name: 'last_signin_date',
    type: 'varchar',
    length: 10,
    nullable: true,
  })
  lastSigninDate: string | null;

  /** 道具背包（key=道具 id，value=数量） */
  @Column({ type: 'jsonb', nullable: true })
  items: Record<string, number> | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
