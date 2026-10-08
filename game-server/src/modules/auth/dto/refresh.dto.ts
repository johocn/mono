import { IsString, MinLength, MaxLength } from 'class-validator';

export class RefreshDto {
  /** 刷新令牌（登录/换会话返回，客户端持久化） */
  @IsString()
  @MinLength(20)
  @MaxLength(512)
  refreshToken: string;
}
