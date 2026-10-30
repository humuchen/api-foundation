import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { TokenExpiredError } from 'jsonwebtoken';
import { PUBLIC_KEY } from '../constants/metadata.constants';
import { BizException } from '../exceptions/biz.exception';
import { ErrorCode } from '../error-codes';

/**
 * 全局认证守卫（APP_GUARD 注册，先于 RolesGuard 执行）：
 *  - 默认全站需登录；@Public() 装饰的类/方法豁免；
 *  - 401 细分：凭证过期 → 20002，缺失/无效 → 20001（由 handleRequest 区分 passport info）。
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    return isPublic ? true : super.canActivate(context);
  }

  handleRequest<TUser = unknown>(
    err: unknown,
    user: unknown,
    info: unknown,
  ): TUser {
    if (err || !user) {
      if (info instanceof TokenExpiredError) throw new BizException(ErrorCode.TOKEN_EXPIRED);
      throw new BizException(ErrorCode.UNAUTHORIZED);
    }
    return user as TUser;
  }
}
