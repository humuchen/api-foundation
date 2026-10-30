import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { AuthUser, LoginResult } from './auth.types';
import { AuthService } from './auth.service';
import { LoginDto, RefreshTokenDto } from './auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  // 登录端点收紧限流：每 IP 60s 5 次（防凭证爆破；超限 429 → 50003）
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Audit('auth:login', { includeBody: true }) // 密码字段由 AuditService.mask 强制脱敏
  @ApiOperation({ summary: '登录签发 JWT（公开端点；内置账号 admin/admin123、ops/ops123456、demo/demo123456）' })
  login(@Body() dto: LoginDto): Promise<LoginResult> {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Audit('auth:refresh', { includeBody: true }) // refreshToken 由 AuditService.mask 强制脱敏
  @ApiOperation({ summary: '刷新凭证（公开端点；用 refreshToken 换取新的 access/refresh 对）' })
  refresh(@Body() dto: RefreshTokenDto): Promise<LoginResult> {
    return this.authService.refresh(dto);
  }

  @Get('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: '当前登录用户信息（演示 @CurrentUser）' })
  profile(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}
