import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cache } from '@nestjs/cache-manager';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ErrorCode } from '../../common/error-codes.js';
import { BizException } from '../../common/exceptions/biz.exception.js';
import { JWT_BLACKLIST_PREFIX } from './auth.constants.js';
import type { AuthUser, VerifiedJwtPayload } from './auth.types.js';

/**
 * JWT 策略：解析 Bearer token → 校验签名与有效期 → 黑名单校验 → validate 注入 req.user。
 * 过期错误由 JwtAuthGuard.handleRequest 统一转换为 20002；
 * refresh 凭证（typ=refresh）不得用于业务接口；已吊销（登出）凭证返回 20001。
 * 黑名单经全局 Cache 存储（memory/Redis），每次鉴权一次 O(1) 读取。
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly cache: Cache,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('auth.jwtSecret'),
    });
  }

  async validate(payload: VerifiedJwtPayload): Promise<AuthUser> {
    if (payload.typ === 'refresh') {
      throw new BizException(ErrorCode.UNAUTHORIZED, '不得使用刷新凭证访问业务接口');
    }
    const revoked = await this.cache.get<string>(`${JWT_BLACKLIST_PREFIX}${payload.jti}`);
    if (revoked) {
      throw new BizException(ErrorCode.UNAUTHORIZED, '凭证已撤销，请重新登录');
    }
    return {
      id: payload.sub,
      username: payload.username,
      roles: Array.isArray(payload.roles) ? payload.roles : [],
      jti: payload.jti,
      exp: payload.exp,
    };
  }
}
