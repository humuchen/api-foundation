import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser } from '../../infra/auth/auth.types';
import { ROLES_KEY } from '../constants/metadata.constants';
import { BizException } from '../exceptions/biz.exception';
import { ErrorCode } from '../error-codes';

/**
 * RBAC 角色守卫（APP_GUARD 注册，后于 JwtAuthGuard 执行）：
 *  - 端点无 @Roles 声明 → 放行（仅要求登录）；
 *  - 有声明 → 任一角色命中即通过，否则 20003（data 携带所需角色便于前端引导）。
 * RBAC 阶段二演进点：roles 来源由装饰器硬编码切换为 rbac.service 落库权限点解析。
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user?.roles?.length) throw new BizException(ErrorCode.FORBIDDEN);
    if (!required.some((role) => user.roles.includes(role))) {
      throw new BizException(ErrorCode.FORBIDDEN, '无访问权限', { requiredRoles: required });
    }
    return true;
  }
}
