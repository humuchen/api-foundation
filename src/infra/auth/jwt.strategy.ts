import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ErrorCode } from '../../common/error-codes';
import { BizException } from '../../common/exceptions/biz.exception';
import type { AuthUser, JwtPayload } from './auth.types';

/**
 * JWT 策略：解析 Bearer token → 校验签名与有效期 → validate 注入 req.user。
 * 过期错误由 JwtAuthGuard.handleRequest 统一转换为 20002；
 * refresh 凭证（typ=refresh）不得用于业务接口。
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('auth.jwtSecret'),
    });
  }

  validate(payload: JwtPayload): AuthUser {
    if (payload.typ === 'refresh') {
      throw new BizException(ErrorCode.UNAUTHORIZED, '不得使用刷新凭证访问业务接口');
    }
    return {
      id: payload.sub,
      username: payload.username,
      roles: Array.isArray(payload.roles) ? payload.roles : [],
    };
  }
}
