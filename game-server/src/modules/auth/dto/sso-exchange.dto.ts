import { IsString, MinLength, MaxLength, IsOptional } from 'class-validator';

export class SsoExchangeDto {
  /** SSO 统一登录页回跳携带的 access_token */
  @IsString()
  @MinLength(10)
  @MaxLength(2048)
  accessToken: string;

  /** 可选：认领本机已有的游客账号（旧进度/积分/皮肤无缝延续，仅当该账号未绑定过 SSO） */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  claimAccountId?: string;

  /** 可选：设备标识 */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string;
}
