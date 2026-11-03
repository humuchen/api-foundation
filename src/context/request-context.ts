import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/** 请求级上下文：由入口中间件建立，拦截器/过滤器/业务日志随取 */
export interface RequestContext {
  requestId: string;
  /** 多租户上下文：来自 X-Tenant-Id 头（可选；数据隔离策略由业务模块按需实现） */
  tenantId: string | undefined;
  method: string;
  url: string;
}

const als = new AsyncLocalStorage<RequestContext>();

const TENANT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** 生成或透传 requestId（优先上游 x-request-id）并解析租户上下文（X-Tenant-Id，非法值忽略） */
export function createRequestContext(req: {
  method?: string;
  url?: string;
  headers?: Record<string, unknown>;
}): RequestContext {
  const incoming = req.headers?.['x-request-id'];
  const passed =
    typeof incoming === 'string' && incoming.trim().length > 0 ? incoming.trim() : undefined;
  const tenantHeader = req.headers?.['x-tenant-id'];
  const tenantRaw = typeof tenantHeader === 'string' ? tenantHeader.trim() : '';
  return {
    requestId: passed ?? randomUUID(),
    tenantId: TENANT_ID_PATTERN.test(tenantRaw) ? tenantRaw : undefined,
    method: req.method ?? 'UNKNOWN',
    url: req.url ?? '-',
  };
}

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return als.run(ctx, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return als.getStore();
}

/** 请求作用域外（如启动期日志）返回 'no-request'，保证日志字段恒存在、便于检索 */
export function getRequestId(): string {
  return als.getStore()?.requestId ?? 'no-request';
}
