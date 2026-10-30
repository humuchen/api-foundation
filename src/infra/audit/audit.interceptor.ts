import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import type { Request } from 'express';
import { AUDIT_KEY } from '../../common/constants/metadata.constants';
import type { AuditMeta } from '../../common/decorators/audit.decorator';
import { getRequestId, getRequestContext } from '../logger';
import type { AuthUser } from '../auth/auth.types';
import { AuditService } from './audit.service';

/**
 * 审计拦截器（APP_INTERCEPTOR 全局注册）：
 * 仅处理 @Audit 标注的端点；响应成败均记录；写入异步化，不增加接口延迟。
 * 与 Logging/Transform 拦截器无顺序耦合（观察者角色）。
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
    const start = Date.now();

    const write = (success: boolean): void => {
      const user = req.user;
      void this.auditService
        .recordAsync({
          requestId: getRequestId(),
          tenantId: getRequestContext()?.tenantId ?? null,
          action: meta.action,
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
