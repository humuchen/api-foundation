import { HttpStatus } from '@nestjs/common';

/**
 * 业务错误码总表 —— 全站唯一事实来源。
 *
 * 分段规则：
 *   1        成功
 *   10xxx    参数/校验错误
 *   20xxx    认证与权限
 *   30xxx    业务规则（按模块再分段：310xx 用户、320xx 订单…）
 *   40xxx    资源状态
 *   50xxx    系统与依赖
 *
 * 约定：新增错误码必须在此登记 code → { httpStatus, message }，
 * 业务代码通过 BizException(code, message?) 抛出，禁止在模块内私造错误码。
 */
export const ErrorCode = {
  OK: 1,

  // 10xxx 参数/校验
  VALIDATION_FAILED: 10001,
  PARAM_INVALID: 10002,

  // 20xxx 认证与权限（P1 鉴权模块启用）
  UNAUTHORIZED: 20001,
  TOKEN_EXPIRED: 20002,
  FORBIDDEN: 20003,
  ACCOUNT_DISABLED: 20004,

  // 30xxx 业务规则
  BIZ_ERROR: 30000,

  // 40xxx 资源状态
  NOT_FOUND: 40001,
  CONFLICT: 40002,

  // 50xxx 系统与依赖
  INTERNAL_ERROR: 50001,
  DEPENDENCY_UNAVAILABLE: 50002,
  RATE_LIMITED: 50003,
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ErrorMeta {
  /** 与 HTTP 状态码双轨：HTTP 表达传输层语义，code 表达业务细分 */
  httpStatus: HttpStatus;
  /** 默认 message；BizException 可覆盖 */
  message: string;
}

export const ERROR_META: Record<Exclude<ErrorCodeValue, typeof ErrorCode.OK>, ErrorMeta> = {
  [ErrorCode.VALIDATION_FAILED]: { httpStatus: HttpStatus.BAD_REQUEST, message: '参数校验失败' },
  [ErrorCode.PARAM_INVALID]: { httpStatus: HttpStatus.BAD_REQUEST, message: '请求参数错误' },

  [ErrorCode.UNAUTHORIZED]: { httpStatus: HttpStatus.UNAUTHORIZED, message: '未登录或凭证无效' },
  [ErrorCode.TOKEN_EXPIRED]: { httpStatus: HttpStatus.UNAUTHORIZED, message: '凭证已过期' },
  [ErrorCode.FORBIDDEN]: { httpStatus: HttpStatus.FORBIDDEN, message: '无访问权限' },
  [ErrorCode.ACCOUNT_DISABLED]: { httpStatus: HttpStatus.FORBIDDEN, message: '账号已被禁用' },

  [ErrorCode.BIZ_ERROR]: { httpStatus: HttpStatus.UNPROCESSABLE_ENTITY, message: '业务处理失败' },

  [ErrorCode.NOT_FOUND]: { httpStatus: HttpStatus.NOT_FOUND, message: '资源不存在' },
  [ErrorCode.CONFLICT]: { httpStatus: HttpStatus.CONFLICT, message: '资源状态冲突' },

  [ErrorCode.INTERNAL_ERROR]: { httpStatus: HttpStatus.INTERNAL_SERVER_ERROR, message: '服务器内部错误' },
  [ErrorCode.DEPENDENCY_UNAVAILABLE]: { httpStatus: HttpStatus.BAD_GATEWAY, message: '依赖服务不可用' },
  [ErrorCode.RATE_LIMITED]: { httpStatus: HttpStatus.TOO_MANY_REQUESTS, message: '请求过于频繁' },
};

/** 未登记错误码的兜底：按系统错误处理，避免脏 code 漏网 */
export function getErrorMeta(code: number): ErrorMeta {
  return (
    (ERROR_META as Record<number, ErrorMeta>)[code] ?? {
      httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
      message: '服务器内部错误',
    }
  );
}
