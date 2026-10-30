import { PaginationDto } from '../dto/pagination.dto';
import { BizException } from '../exceptions/biz.exception';
import { ErrorCode } from '../error-codes';

/**
 * 分页 DTO → ORM 中立查询结构：Prisma/TypeORM 适配层可直接消费，
 * 业务模块不直接感知 ORM 术语（数据层替换时此契约保持不变）。
 */
export interface QueryOptions {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
  order: Record<string, 'ASC' | 'DESC'>;
}

export const DEFAULT_SORT_FIELD = 'createdAt';

/**
 * @param dto               分页参数（已经全局管道校验）
 * @param allowedSortFields 可排序字段白名单（防排序注入；各模块按实体声明，缺省仅允许 createdAt）
 */
export function toQueryOptions(
  dto: PaginationDto,
  allowedSortFields: string[] = [DEFAULT_SORT_FIELD],
): QueryOptions {
  const [field, dir] = dto.sort ? dto.sort.split(':') : [DEFAULT_SORT_FIELD, 'desc'];
  const sortField = field ?? DEFAULT_SORT_FIELD;
  if (!allowedSortFields.includes(sortField)) {
    throw new BizException(ErrorCode.PARAM_INVALID, `不允许的排序字段：${sortField}`, {
      allowedSortFields,
    });
  }
  return {
    page: dto.page,
    pageSize: dto.pageSize,
    skip: (dto.page - 1) * dto.pageSize,
    take: dto.pageSize,
    order: { [sortField]: dir === 'asc' ? 'ASC' : 'DESC' },
  };
}
