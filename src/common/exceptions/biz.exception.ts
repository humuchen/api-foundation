import { HttpException } from '@nestjs/common';
import { getErrorMeta } from '../error-codes';

/**
 * 业务异常：业务代码主动抛出的唯一入口。
 *
 * 用法：
 *   throw new BizException(ErrorCode.BIZ_ERROR);                        // 使用默认 message 与 HTTP 状态
 *   throw new BizException(ErrorCode.BIZ_ERROR, '库存不足', { skuId }); // 覆盖 message、携带结构化 data
 *
 * 继承 HttpException 以便被 Nest 异常链路与 AllExceptionsFilter 统一处理；
 * 过滤器从 bizCode/data 字段读取业务语义。
 */
export class BizException extends HttpException {
  readonly bizCode: number;
  readonly data: unknown;

  constructor(bizCode: number, message?: string, data: unknown = null, httpStatus?: number) {
    const meta = getErrorMeta(bizCode);
    super(message ?? meta.message, httpStatus ?? meta.httpStatus);
    this.bizCode = bizCode;
    this.data = data;
  }
}
