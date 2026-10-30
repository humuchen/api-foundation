import { ErrorCode, getErrorMeta } from '../error-codes';

/** 全站统一响应包壳（由 TransformInterceptor / AllExceptionsFilter 保证） */
export interface ApiResponse<T = unknown> {
  /** 1 = 成功；非 1 = 业务/系统错误码（见 common/error-codes.ts） */
  code: number;
  message: string;
  /** 业务数据；校验失败等场景为结构化明细；分页接口（P1）为 PageVo<T> */
  data: T;
  /** 链路 ID：与日志、审计贯通；透传上游 x-request-id 或服务端生成 */
  requestId: string;
  timestamp: number;
}

export function buildSuccess<T>(data: T, requestId: string): ApiResponse<T> {
  return { code: ErrorCode.OK, message: 'ok', data, requestId, timestamp: Date.now() };
}

export function buildFailure(code: number, message?: string, data: unknown = null, requestId = ''): ApiResponse {
  return {
    code,
    message: message ?? getErrorMeta(code).message,
    data,
    requestId,
    timestamp: Date.now(),
  };
}

/** 防御性判断：已包壳的返回值直接透传，避免双层包壳 */
export function isApiResponse(value: unknown): value is ApiResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof (value as { code: unknown }).code === 'number' &&
    'message' in value &&
    'requestId' in value &&
    'timestamp' in value
  );
}
