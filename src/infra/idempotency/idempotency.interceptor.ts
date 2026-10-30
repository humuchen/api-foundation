import { Cache } from '@nestjs/cache-manager';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { IDEMPOTENT_KEY } from '../../common/decorators/idempotent.decorator';

const IDEMPOTENCY_HEADER = 'idempotency-key';
const REPLAY_HEADER = 'x-idempotent-replayed';
const TTL_MS = 86_400_000; // 24h
const CACHE_PREFIX = 'idem';

/**
 * 幂等拦截器（APP_INTERCEPTOR 全局注册，@Idempotent 声明端点生效）：
 *  - 首次请求：正常执行，成功结果入缓存（失败不入缓存，可重试）；
 *  - 同键重放（已完成）：直接返回缓存结果，响应头标注重放，业务不重复执行；
 *  - 同键并发（在途）：合并等待首次结果，保证只执行一次；
 *  - 存储为进程内存（Keyv/in-memory）：跨实例/重启场景接入 Redis 后即可升级，
 *    接口契约（header/响应头/语义）保持不变。
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  /** 在途登记：key → 首次执行的 Promise */
  private readonly pending = new Map<string, Promise<unknown>>();

  constructor(
    private readonly reflector: Reflector,
    private readonly cache: Cache,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const enabled = this.reflector.getAllAndOverride<boolean>(IDEMPOTENT_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!enabled) return next.handle();

    const http = ctx.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const idemKey = (req.headers[IDEMPOTENCY_HEADER] ?? '').toString().trim();
    // 未携带幂等键：按普通请求处理（幂等能力是可选启用，不强制客户端行为）
    if (!idemKey) return next.handle();

    const key = `${CACHE_PREFIX}:${req.method}:${req.path}:${idemKey}`;

    return new Observable<unknown>((subscriber) => {
      void this.execute(key, res, next).then(
        (value) => {
          subscriber.next(value);
          subscriber.complete();
        },
        (err) => subscriber.error(err),
      );
    });
  }

  private async execute(key: string, res: Response, next: CallHandler): Promise<unknown> {
    // 1) 已完成：命中缓存重放
    const cached = await this.cache.get<unknown>(key);
    if (cached !== undefined) {
      res.setHeader(REPLAY_HEADER, 'true');
      return cached;
    }

    // 2) 在途：合并到首次执行
    const inflight = this.pending.get(key);
    if (inflight) {
      res.setHeader(REPLAY_HEADER, 'true');
      return inflight;
    }

    // 3) 首次执行：登记在途 → 成功落缓存 → 撤销在途
    const execution = firstValueFrom(next.handle(), { defaultValue: undefined })
      .then(async (value: unknown) => {
        await this.cache.set(key, value, TTL_MS);
        return value;
      })
      .finally(() => {
        this.pending.delete(key);
      });
    this.pending.set(key, execution);
    return execution;
  }
}
