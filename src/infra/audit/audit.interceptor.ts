import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import type { Request } from 'express';
import { AUDIT_KEY } from '../../common/constants/metadata.constants.js';
import type { AuditMeta } from '../../common/decorators/audit.decorator.js';
import { getRequestId, getRequestContext } from '../logger/index.js';
import type { AuthUser } from '../auth/auth.types.js';
import { AuditService } from './audit.service.js';

/**
 * 审计拦截器（APP_INTERCEPTOR 全局注册）：
 * 仅处理 @Audit 标注的端点；响应成败均记录；写入异步化，不增加接口延迟。
 * 与 Logging/Transform 拦截器无顺序耦合（观察者角色）。
 *
 * 动态动作：action 支持 {param} 占位符（如 'crud:{resource}:create'），
 * 以路由参数展开（→ 'crud:products:create'）—— 通用 CRUD 等动态资源端点复用全局审计管线。
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.getAllAndOverride<AuditMeta | undefined>(AUDIT_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!meta) return next.handle();

    const http = ctx.switchToHttp();
    const req = http.getRequest<Request & { user?: AuthUser }>();
    const action = expandAction(meta.action, req.params);
    const start = Date.now();

    const write = (success: boolean): void => {
      const user = req.user;
      void this.auditService
        .recordAsync({
          requestId: getRequestId(),
          tenantId: getRequestContext()?.tenantId ?? null,
          action,
          method: req.method,
          path: req.originalUrl ?? req.url,
          actorId: user?.id ?? null,
          actorUsername: user?.username ?? null,
          body: meta.includeBody ? this.auditService.mask(req.body) : undefined,
          success,
          durationMs: Date.now() - start,
        })
        .catch(() => {
          /* 审计失败不影响主流程 */
        });
    };

    return next.handle().pipe(
      tap({
        next: () => write(true),
        error: () => write(false),
      }),
    );
  }
}

/** 动作占位符展开：'{resource}' → 路由参数值（缺参保留原占位便于排查） */
function expandAction(action: string, params: Request['params'] | undefined): string {
  if (!params || !action.includes('{')) return action;
  return action.replace(/\{(\w+)\}/g, (_m, key: string) => String(params[key] ?? `{${key}}`));
}
