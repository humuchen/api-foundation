import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Observable } from 'rxjs';
// ESM 互操作：jsonwebtoken 为纯 CJS，具名导出无法被 Node 静态探测，须默认导入后解构
import jsonwebtoken from 'jsonwebtoken';
import { PUBLIC_KEY } from '../constants/metadata.constants.js';
import { BizException } from '../exceptions/biz.exception.js';
import { ErrorCode } from '../error-codes.js';

const { TokenExpiredError } = jsonwebtoken;

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

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
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
      // 策略层主动抛出的业务异常（凭证已撤销/类型错误）原样透出，保留细分语义
      if (err instanceof BizException) throw err;
      if (info instanceof TokenExpiredError) throw new BizException(ErrorCode.TOKEN_EXPIRED);
      throw new BizException(ErrorCode.UNAUTHORIZED);
    }
    return user as TUser;
  }
}
