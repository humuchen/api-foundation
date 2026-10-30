import type { NextFunction, Request, Response } from 'express';
import { createRequestContext, runWithRequestContext } from './request-context';

/**
 * 请求上下文中间件：生成/透传 requestId → 写回响应头 → 建立 AsyncLocalStorage 作用域。
 * 以原生 express 中间件形式在 main.ts 注册（早于 Nest 路由/守卫/拦截器执行），
 * 规避 Nest 12(Express 5) 下 forRoutes 通配符写法的兼容性问题。
 */
export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ctx = createRequestContext(req);
  res.setHeader('x-request-id', ctx.requestId);
  runWithRequestContext(ctx, () => next());
}
