import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser } from '../../../contracts/index.js';
import { ErrorCode } from '../../../common/error-codes.js';
import { BizException } from '../../../common/exceptions/biz.exception.js';
import { PERM_KEY, type PermMeta } from './perm.decorator.js';
import { RbacService } from './rbac.service.js';

/**
 * admin 实时权限守卫（AdminModule.forRoot 以 APP_GUARD 注册，执行顺序
 * 位于底座 Throttler → JwtAuthGuard → RolesGuard 之后）：
 *  - 端点无 @RequirePerm 声明 → 放行（既有 @Roles 端点行为不受影响）；
 *  - 有声明 → 经 RbacService 实时解析权限集合（缓存 + 写失效），超管角色通配；
 *  - 未命中 → 20003，data 携带 requiredPermission 便于前端引导。
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<PermMeta | undefined>(PERM_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!meta?.code) return true;

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!request.user) throw new BizException(ErrorCode.UNAUTHORIZED);
    await this.rbacService.requirePermission(request.user, meta.code);
    return true;
  }
}
