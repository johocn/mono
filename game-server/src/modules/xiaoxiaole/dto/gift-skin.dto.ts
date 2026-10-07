import { IsString, MaxLength } from 'class-validator';

/** 赠送皮肤给好友（按对方登录账号名） */
export class GiftSkinDto {
  @IsString()
  @MaxLength(64)
  skinId: string;

  /** 好友的登录账号名 */
  @IsString()
  @MaxLength(64)
  toUsername: string;
}
