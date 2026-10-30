import pino from 'pino';
import { getRequestContext } from './request-context';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'];

let rootLogger: pino.Logger | undefined;

/**
 * pino 根实例初始化。须在 NestFactory.create 之前调用（main.ts 第一步），
 * 确保 Nest 内部启动日志也经 pino 输出。
 * 环境变量合法性由 config/env.validation.ts 兜底，此处仅做宽松防御：
 * 非法 level 回落 info；pino-pretty 缺失或生产环境直接输出结构化 JSON。
 */
export function initLogger(): void {
  if (rootLogger) return;
  const rawLevel = process.env.LOG_LEVEL ?? 'info';
  const level = LOG_LEVELS.includes(rawLevel) ? rawLevel : 'info';
  const usePretty = (process.env.NODE_ENV ?? 'development') !== 'production' && isPinoPrettyAvailable();

  rootLogger = pino({
    level,
    ...(usePretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
          },
        }
      : {}),
  });
}

/**
 * 当前作用域日志器：请求内（AsyncLocalStorage 存在）返回附加了 requestId
 * 与 tenantId（如携带）的 child 实例，请求外返回根实例。
 * 业务代码统一通过 getLogger() 取日志器，不要直接持有引用。
 */
export function getLogger(): pino.Logger {
  if (!rootLogger) initLogger();
  const ctx = getRequestContext();
  const base = rootLogger as pino.Logger;
  if (!ctx) return base;
  const fields: Record<string, string> = { requestId: ctx.requestId };
  if (ctx.tenantId) fields.tenantId = ctx.tenantId;
  return base.child(fields);
}

function isPinoPrettyAvailable(): boolean {
  try {
    require.resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}
