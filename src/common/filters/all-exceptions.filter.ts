import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { BizException } from '../exceptions/biz.exception';
import { ErrorCode } from '../error-codes';
import { buildFailure } from '../responses/api-response';
import { getRequestId } from '../../infra/logger';

interface NormalizedError {
  httpStatus: number;
  code: number;
  message: string;
  data: unknown;
  /** 内部细节：仅写入日志，不对外透出 */
  internal?: string;
}

/**
 * 全局异常过滤器 —— 全站错误响应唯一出口。
 * 三层归一：
 *   1. BizException        → 业务 code/message/data（校验管道失败亦归入此层）
 *   2. HttpException       → Nest 内置异常（404/401 等），按 HTTP 状态映射到错误码段
 *   3. Unknown Error       → 50001 兜底，对外隐藏细节，日志保留完整信息
 * 响应体：buildFailure + requestId（来自 AsyncLocalStorage 请求上下文）。
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request>();
    const requestId = getRequestId();

    const normalized = this.normalize(exception, req);
    const body = buildFailure(normalized.code, normalized.message, normalized.data, requestId);

    if (normalized.httpStatus >= 500) {
      this.logger.error(
        `${req.method} ${req.url} → ${normalized.httpStatus} ${normalized.message}`,
        normalized.internal,
      );
    } else {
      this.logger.warn(`${req.method} ${req.url} → ${normalized.httpStatus} ${normalized.message}`);
    }

    res.status(normalized.httpStatus).json(body);
  }

  private normalize(exception: unknown, req: Request): NormalizedError {
    // 1) 业务异常（含全局 ValidationPipe 的 exceptionFactory 产物）
    if (exception instanceof BizException) {
      return {
        httpStatus: exception.getStatus(),
        code: exception.bizCode,
        message: exception.message,
        data: exception.data,
      };
    }

    // 2) 框架 HttpException（Nest 内置 404、401 等）
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const detail = this.extractMessage(exception.getResponse());
      const { code, message } = this.mapStatus(status);
      return {
        httpStatus: status,
        code,
        message,
        // 404 透出原始路径便于定位；其余保持 data 为空，内部细节仅入日志
        data: status === HttpStatus.NOT_FOUND ? { path: req.url, detail } : null,
        internal: typeof detail === 'string' ? detail : JSON.stringify(detail),
      };
    }

    // 3) 未知异常：对外隐藏，日志保留完整堆栈
    const internal =
      exception instanceof Error ? `${exception.message}\n${exception.stack ?? ''}` : String(exception);
    return {
      httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message: '服务器内部错误',
      data: null,
      internal,
    };
  }

  /** HTTP 状态码 → 错误码段映射（BizException 自带 code，不走此映射） */
  private mapStatus(status: number): { code: number; message: string } {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return { code: ErrorCode.PARAM_INVALID, message: '请求参数错误' };
      case HttpStatus.UNAUTHORIZED:
        return { code: ErrorCode.UNAUTHORIZED, message: '未登录或凭证无效' };
      case HttpStatus.FORBIDDEN:
        return { code: ErrorCode.FORBIDDEN, message: '无访问权限' };
      case HttpStatus.NOT_FOUND:
        return { code: ErrorCode.NOT_FOUND, message: '资源不存在' };
      case HttpStatus.CONFLICT:
        return { code: ErrorCode.CONFLICT, message: '资源状态冲突' };
      case HttpStatus.PAYLOAD_TOO_LARGE:
        return { code: ErrorCode.PARAM_INVALID, message: '请求体超过大小限制' };
      case HttpStatus.TOO_MANY_REQUESTS:
        return { code: ErrorCode.RATE_LIMITED, message: '请求过于频繁' };
      default:
        return { code: ErrorCode.INTERNAL_ERROR, message: '服务器内部错误' };
    }
  }

  private extractMessage(payload: string | object): string | string[] {
    if (typeof payload === 'string') return payload;
    const msg = (payload as { message?: unknown }).message;
    if (typeof msg === 'string' || Array.isArray(msg)) return msg;
    return JSON.stringify(payload);
  }
}
