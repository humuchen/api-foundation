import { SetMetadata } from '@nestjs/common';

export const IDEMPOTENT_KEY = 'foundation:idempotent';

/**
 * 标注端点支持幂等重放：客户端携带 Idempotency-Key 请求头时，
 * 同键重复提交返回首次结果（响应头 X-Idempotent-Replayed: true 标注重放），
 * 不重复执行业务逻辑。TTL 24h；由 IdempotencyInterceptor 实现。
 */
export const Idempotent = () => SetMetadata(IDEMPOTENT_KEY, true);
