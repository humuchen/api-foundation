import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../error-codes';
import { buildFailure, buildSuccess, isApiResponse } from './api-response';

describe('api-response（统一响应构造）', () => {
  it('buildSuccess → code=0 / ok / 透传 data 与 requestId', () => {
    const r = buildSuccess({ a: 1 }, 'req-1');
    expect(r.code).toBe(0);
    expect(r.message).toBe('ok');
    expect(r.data).toEqual({ a: 1 });
    expect(r.requestId).toBe('req-1');
    expect(typeof r.timestamp).toBe('number');
  });

  it('buildFailure → message 默认取自错误码表', () => {
    const r = buildFailure(ErrorCode.NOT_FOUND, undefined, null, 'req-2');
    expect(r.code).toBe(40001);
    expect(r.message).toBe('资源不存在');
    expect(r.requestId).toBe('req-2');
  });

  it('buildFailure → 允许覆盖 message', () => {
    const r = buildFailure(ErrorCode.BIZ_ERROR, '库存不足');
    expect(r.code).toBe(30000);
    expect(r.message).toBe('库存不足');
  });

  it('isApiResponse：包壳形态识别（防双层包壳）', () => {
    expect(isApiResponse(buildSuccess(null, 'r'))).toBe(true);
    expect(isApiResponse({ code: 0 })).toBe(false);
    expect(isApiResponse(null)).toBe(false);
    expect(isApiResponse('str')).toBe(false);
  });
});
