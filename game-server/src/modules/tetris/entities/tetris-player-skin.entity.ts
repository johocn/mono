import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/** 玩家已解锁的方块皮肤（积分兑换 / 默认免费解锁共用一张表） */
@Entity('tetris_player_skins')
@Index(['playerId', 'skinId'], { unique: true })
export class TetrisPlayerSkin {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Index()
  @Column({ name: 'player_id', type: 'bigint' })
  playerId: string;

  @Column({ name: 'skin_id', type: 'varchar', length: 64 })
  skinId: string;

  /** points=积分兑换 default=默认免费 */
  @Column({ type: 'varchar', length: 16, default: 'points' })
  source: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
