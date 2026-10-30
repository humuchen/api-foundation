import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '../../infra/auth/auth.types';

/** 参数装饰器：获取当前登录用户（由全局 JwtAuthGuard 写入 req.user） */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<{ user: AuthUser }>().user,
);
