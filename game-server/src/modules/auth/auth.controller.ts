import { Body, Controller, Post, Ip, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SsoExchangeDto } from './dto/sso-exchange.dto';
import { RefreshDto } from './dto/refresh.dto';
import { Public } from '@common/decorators/public.decorator';
import { RateLimit } from '@common/decorators/rate-limit.decorator';

@ApiTags('Auth')
@Controller('api/client/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: '账号注册' })
  @RateLimit({ windowSeconds: 60, maxRequests: 5 })
  async register(@Body() dto: RegisterDto, @Ip() ip: string) {
    return this.authService.register(dto.username, dto.password, dto.nickname, dto.deviceId);
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: '账号登录' })
  @RateLimit({ windowSeconds: 60, maxRequests: 5 })
  async login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.authService.login(dto.username, dto.password, ip, dto.deviceId);
  }

  @Public()
  @Post('guest')
  @ApiOperation({ summary: '游客登录' })
  async guest(@Ip() ip: string, @Headers('user-agent') userAgent?: string) {
    return this.authService.createGuest(ip, userAgent);
  }

  @Public()
  @Post('sso-exchange')
  @ApiOperation({ summary: 'SSO 统一登录换会话（accessToken 直验 + 游客认领）' })
  @RateLimit({ windowSeconds: 60, maxRequests: 20 })
  async ssoExchange(@Body() dto: SsoExchangeDto, @Ip() ip: string, @Headers('user-agent') userAgent?: string) {
    return this.authService.ssoExchange(dto.accessToken, dto.claimAccountId, ip, dto.deviceId ?? userAgent);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: '刷新访问令牌（refresh token 换发新 access token，并轮换 refresh token）' })
  @RateLimit({ windowSeconds: 60, maxRequests: 30 })
  async refresh(@Body() dto: RefreshDto, @Ip() ip: string, @Headers('user-agent') userAgent?: string) {
    return this.authService.refresh(dto.refreshToken, ip, userAgent);
  }
}
