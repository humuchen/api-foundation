import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';

/**
 * 请求耗时统计。
 * 日志经 Nest Logger → AppLoggerService(pino) 输出；请求作用域内自动携带 requestId
 * （由 infra/logger 的 AsyncLocalStorage 注入）。
 * 失败请求仅在此记录耗时，错误详情（含堆栈）由 AllExceptionsFilter 统一记录，避免重复。
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<{ method?: string; url?: string }>();
    const method = req?.method ?? 'UNKNOWN';
    const url = req?.url ?? '-';
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => this.logger.log(`${method} ${url} ${Date.now() - start}ms`),
        error: (err: unknown) =>
          this.logger.warn(
            `${method} ${url} ${Date.now() - start}ms failed: ${err instanceof Error ? err.message : String(err)}`,
          ),
      }),
    );
  }
}
