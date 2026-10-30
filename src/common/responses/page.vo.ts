/**
 * 通用分页响应结构：作为 ApiResponse.data 的分页形态。
 * 泛型接口（非 class），与 ORM/序列化无耦合；由 buildPage 构造，TransformInterceptor 统一包壳。
 */
export interface PageVo<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function buildPage<T>(items: T[], total: number, page: number, pageSize: number): PageVo<T> {
  return {
    list: items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / Math.max(pageSize, 1))),
  };
}
