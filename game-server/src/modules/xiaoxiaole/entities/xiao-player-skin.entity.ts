import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/** 玩家已解锁的消消乐皮肤（积分兑换 / 人民币购买 / 分享码导入共用一张表） */
@Entity('xiao_player_skins')
@Index(['playerId', 'skinId'], { unique: true })
export class XiaoPlayerSkin {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Index()
  @Column({ name: 'player_id', type: 'bigint' })
  playerId: string;

  @Column({ name: 'skin_id', type: 'varchar', length: 64 })
  skinId: string;

  /** points=积分兑换 rmb=人民币购买 share=分享码导入 author=自己发布 */
  @Column({ type: 'varchar', length: 16, default: 'points' })
  source: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
