import {
  IsString,
  IsInt,
  IsObject,
  IsArray,
  IsOptional,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

/** 发布皮肤到模板中心 */
export class CreateSkinDto {
  /** 前端皮肤 id；不传则由服务端生成 */
  @IsString()
  @IsOptional()
  @MaxLength(64)
  skinId?: string;

  @IsString()
  @MaxLength(64)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(64)
  authorName?: string;

  /** 皮肤完整配置（与前端 SkinConfig 对应） */
  @IsObject()
  config: Record<string, any>;

  @IsString()
  @IsOptional()
  @MaxLength(512)
  coverUrl?: string;

  /** 积分换购价（0 = 不可用积分购买） */
  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(1_000_000)
  pricePoints?: number;

  /** 人民币价（分，0 = 不可用人民币购买） */
  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(10_000_000)
  priceCents?: number;

  @IsArray()
  @IsOptional()
  tags?: string[];
}
