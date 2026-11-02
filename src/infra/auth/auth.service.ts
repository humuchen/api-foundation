import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cache } from '@nestjs/cache-manager';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { StringValue } from 'ms';
import { ErrorCode } from '../../common/error-codes.js';
import { BizException } from '../../common/exceptions/biz.exception.js';
import { UserVo, UserService } from '../../modules/user/user.service.js';
import type { LoginDto, LogoutDto, RefreshTokenDto } from './auth.dto.js';
import { JWT_BLACKLIST_PREFIX } from './auth.constants.js';
import type { JwtPayload, LoginResult, TokenType, VerifiedJwtPayload } from './auth.types.js';

/**
 * 认证服务：凭证校验委托给用户域（UserService.verifyCredentials，失败抛 20001/20004）。
 * 双凭证模型：access（短效，typ=access）+ refresh（长效，typ=refresh，用于换取新对）。
 * 凭证治理（黑名单经全局 Cache 存储：memory 开发态 / Redis 多实例态）：
 *  - jti：每张凭证携带唯一 JWT ID，吊销以 jti 为粒度；
 *  - 轮换：refresh 一次性使用——换取新对后旧 refresh jti 立即入黑名单（TTL 至自然过期），
 *    重放旧 refresh 即 20001，可有效应对凭证泄露；
 *  - 登出：吊销当前 access jti 与可选提交的 refresh jti。
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly userService: UserService,
    private readonly cache: Cache,
  ) {}

  async login(dto: LoginDto): Promise<LoginResult> {
    const user: UserVo = await this.userService.verifyCredentials(dto.username, dto.password);
    return this.issueTokens(user);
  }

  /** 用 refreshToken 换取新凭证对（校验类型标记 + 黑名单 + 用户仍有效；旧 refresh 轮换吊销） */
  async refresh(dto: RefreshTokenDto): Promise<LoginResult> {
    let payload: VerifiedJwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<VerifiedJwtPayload>(dto.refreshToken);
    } catch {
      throw new BizException(ErrorCode.UNAUTHORIZED, '刷新凭证无效或已过期');
    }
    if (payload.typ !== 'refresh') {
      throw new BizException(ErrorCode.UNAUTHORIZED, '凭证类型错误');
    }
    // 黑名单：已轮换/已吊销的 refresh 不得再次使用（一次性凭证）
    const revoked = await this.cache.get<string>(`${JWT_BLACKLIST_PREFIX}${payload.jti}`);
    if (revoked) {
      throw new BizException(ErrorCode.UNAUTHORIZED, '刷新凭证已使用或已撤销');
    }
    const user: UserVo = await this.userService.findOne(payload.sub); // 不存在 → 40001
    if (user.disabled) throw new BizException(ErrorCode.ACCOUNT_DISABLED);
    await this.revoke(payload.jti, payload.exp, 'rotated');
    return this.issueTokens(user);
  }

  /**
   * 登出：吊销当前 access 凭证（req.user 的 jti），可选同时吊销请求体中的 refreshToken。
   * 无效的 refreshToken 静默忽略——登出语义以吊销当前凭证为主，不因重复登出报错。
   */
  async logout(
    user: { id: string; jti: string; exp: number },
    dto: LogoutDto,
  ): Promise<{ id: string }> {
    await this.revoke(user.jti, user.exp, 'logout');
    if (dto.refreshToken) {
      try {
        const payload = await this.jwtService.verifyAsync<VerifiedJwtPayload>(dto.refreshToken);
        if (payload.typ === 'refresh') {
          await this.revoke(payload.jti, payload.exp, 'logout');
        }
      } catch {
        /* 已过期/伪造的 refreshToken 无需吊销 */
      }
    }
    return { id: user.id };
  }

  private async issueTokens(user: {
    id: string;
    username: string;
    roles: string[];
  }): Promise<LoginResult> {
    const base = { sub: user.id, username: user.username, roles: user.roles };
    const withTyp = (t: TokenType): JwtPayload => ({ ...base, typ: t, jti: randomUUID() });
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(withTyp('access')),
      this.jwtService.signAsync(withTyp('refresh'), {
        expiresIn: this.configService.get<StringValue>('auth.refreshExpiresIn', '7d'),
      }),
    ]);
    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.configService.get<string>('auth.jwtExpiresIn', '2h'),
      refreshExpiresIn: this.configService.get<string>('auth.refreshExpiresIn', '7d'),
    };
  }

  /** 吊销凭证：jti 入黑名单，TTL 至其自然过期（过期后条目自动失效，无需清理） */
  private async revoke(jti: string, expiresAtSec: number, reason: string): Promise<void> {
    const ttlMs = expiresAtSec * 1000 - Date.now();
    if (ttlMs <= 0) return;
    await this.cache.set(`${JWT_BLACKLIST_PREFIX}${jti}`, reason, ttlMs);
  }
}
