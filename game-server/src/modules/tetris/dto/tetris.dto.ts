import {
  IsInt,
  IsOptional,
  IsString,
  IsObject,
  Max,
  Min,
  MaxLength,
} from 'class-validator';

/** 客户端上报获得积分（服务端做上限保护 + refId 幂等，防止刷分） */
export class EarnPointsDto {
  @IsInt()
  @Min(1)
  @Max(1000)
  amount: number;

  /** earn_pass / earn_daily / earn_ad / earn_share */
  @IsString()
  @MaxLength(32)
  type: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  refId?: string;
}

/** 客户端增量/全量上报进度（服务端取 max 合并，bestScore 不回退、背包不丢） */
export class SaveProgressDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  bestScore?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  plays?: number;

  @IsOptional()
  @IsObject()
  items?: Record<string, number>;

  @IsOptional()
  @IsInt()
  @Min(0)
  signinStreak?: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  lastSignDate?: string;
}

/** 积分兑换皮肤 */
export class UnlockSkinDto {
  @IsString()
  @MaxLength(64)
  skinId: string;
}
