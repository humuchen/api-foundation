import { Injectable, LoggerService } from '@nestjs/common';
import { getLogger } from './logger';

type PinoLevel = 'info' | 'error' | 'warn' | 'debug';

/**
 * Nest 内置 Logger 的 pino 适配器（main.ts 中经 app.useLogger 挂载）。
 * 效果：Nest 框架内部日志与业务侧 new Logger() 输出统一走 pino；
 * 请求作用域内（AsyncLocalStorage）自动携带 requestId 字段，启动期日志 requestId=no-request。
 */
@Injectable()
export class AppLoggerService implements LoggerService {
  log(message: unknown, context?: string): void {
    this.write('info', message, context);
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.write('error', message, context, trace);
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  private write(level: PinoLevel, message: unknown, context?: string, trace?: string): void {
    const logger = getLogger();
    const fields: Record<string, unknown> = {};
    if (context) fields.context = context;
    if (trace) fields.trace = trace;

    if (typeof message === 'string') {
      logger[level](fields, message);
    } else if (message instanceof Error) {
      logger[level]({ ...fields, err: message }, message.message);
    } else {
      logger[level]({ ...fields, data: message }, context ? `[${context}]` : 'log');
    }
  }
}
