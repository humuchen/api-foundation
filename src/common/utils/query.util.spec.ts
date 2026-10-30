import { describe, expect, it } from 'vitest';
import { BizException } from '../exceptions/biz.exception';
import { ErrorCode } from '../error-codes';
import { PaginationDto } from '../dto/pagination.dto';
import { toQueryOptions } from './query.util';

describe('toQueryOptions（分页 → 中立查询结构）', () => {
  it('默认参数：page=1 / pageSize=20 → createdAt DESC', () => {
    const opts = toQueryOptions(new PaginationDto());
    expect(opts).toEqual({
      page: 1,
      pageSize: 20,
      skip: 0,
      take: 20,
      order: { createdAt: 'DESC' },
    });
  });

  it('page=3 / pageSize=10 → skip=20 / take=10', () => {
    const dto = new PaginationDto();
    dto.page = 3;
    dto.pageSize = 10;
    const opts = toQueryOptions(dto, ['createdAt']);
    expect(opts.skip).toBe(20);
    expect(opts.take).toBe(10);
  });

  it('排序字段在白名单内 → 应用对应方向', () => {
    const dto = new PaginationDto();
    dto.sort = 'username:asc';
    const opts = toQueryOptions(dto, ['username']);
    expect(opts.order).toEqual({ username: 'ASC' });
  });

  it('排序字段不在白名单 → 抛 10002（防排序注入）', () => {
    const dto = new PaginationDto();
    dto.sort = 'password:desc';
    expect(() => toQueryOptions(dto, ['username'])).toThrow(BizException);
    try {
      toQueryOptions(dto, ['username']);
    } catch (e) {
      expect((e as BizException).bizCode).toBe(ErrorCode.PARAM_INVALID);
      expect((e as BizException).data).toEqual({
        allowedSortFields: ['username'],
      });
    }
  });
});
