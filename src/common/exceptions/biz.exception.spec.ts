import { describe, expect, it } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../error-codes';
import { BizException } from './biz.exception';

describe('BizException（业务异常 → 错误码/HTTP 状态映射）', () => {
  it('默认 message 与 HTTP 状态取自错误码表', () => {
    const e = new BizException(ErrorCode.VALIDATION_FAILED);
    expect(e.bizCode).toBe(10001);
    expect(e.message).toBe('参数校验失败');
    expect(e.getStatus()).toBe(HttpStatus.BAD_REQUEST);
  });

  it('覆盖 message 并携带结构化 data', () => {
    const e = new BizException(ErrorCode.BIZ_ERROR, '库存不足', { sku: 'A1' });
    expect(e.message).toBe('库存不足');
    expect(e.data).toEqual({ sku: 'A1' });
    expect(e.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
  });

  it('未登记错误码 → 50001 兜底（防脏 code 漏网）', () => {
    const e = new BizException(99999);
    expect(e.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(e.message).toBe('服务器内部错误');
  });

  it('允许显式覆盖 HTTP 状态码', () => {
    const e = new BizException(ErrorCode.CONFLICT, undefined, null, HttpStatus.BAD_REQUEST);
    expect(e.getStatus()).toBe(HttpStatus.BAD_REQUEST);
  });
});
