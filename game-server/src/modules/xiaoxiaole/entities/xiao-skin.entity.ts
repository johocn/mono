import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';

/**
 * 消消乐皮肤（模板中心）
 * 表前缀 xiao_：与 game-server 其他项目数据隔离，但 player_id 复用 players 体系的 id。
 */
@Entity('xiao_skins')
export class XiaoSkin {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  /** 前端皮肤唯一 id（与分享码一致），便于前端直接寻址 */
  @Index({ unique: true })
  @Column({ name: 'skin_id', type: 'varchar', length: 64 })
  skinId: string;

  @Column({ type: 'varchar', length: 64 })
  name: string;

  @Column({ name: 'author_name', type: 'varchar', length: 64, default: '匿名' })
  authorName: string;

  /** 作者玩家 id（复用 players.id） */
  @Index()
  @Column({ name: 'player_id', type: 'bigint' })
  playerId: string;

  /** 皮肤完整配置（配色 + 贴图地址），与前端 SkinConfig 对应 */
  @Column({ name: 'config_json', type: 'jsonb' })
  configJson: Record<string, any>;

  @Column({ name: 'cover_url', type: 'varchar', length: 512, nullable: true })
  coverUrl: string | null;

  /** 积分换购价（0 表示不可用积分购买） */
  @Column({ name: 'price_points', type: 'int', default: 0 })
  pricePoints: number;

  /** 人民币价（分，0 表示不可用人民币购买） */
  @Column({ name: 'price_cents', type: 'int', default: 0 })
  priceCents: number;

  /** 1=已上架 0=下架/驳回 2=待审核 */
  @Index()
  @Column({ type: 'smallint', default: 1 })
  status: number;

  /** 审核备注：驳回原因（待审核/上架时为空） */
  @Column({ name: 'review_note', type: 'varchar', length: 200, nullable: true })
  reviewNote: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  tags: string[];

  @Column({ name: 'download_count', type: 'int', default: 0 })
  downloadCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
