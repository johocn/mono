import { IsString, IsInt, IsOptional, Min, Max, MaxLength } from 'class-validator';

/** 客户端上报获得积分（服务端做上限保护，防止刷分） */
export class EarnPointsDto {
  @IsInt()
  @Min(1)
  @Max(1000)
  amount: number;

  /** earn_pass / earn_daily / earn_ad / earn_share */
  @IsString()
  @MaxLength(32)
  type: string;

  @IsString()
  @IsOptional()
  @MaxLength(64)
  refId?: string;
}

/** 积分兑换皮肤 */
export class RedeemSkinDto {
  @IsString()
  @MaxLength(64)
  skinId: string;
}
