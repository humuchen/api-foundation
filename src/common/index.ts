/**
 * 横切底座出口（子路径 ./common）：
 * 错误码、BizException、统一响应/分页契约、参数装饰器、公共 DTO 与查询工具。
 * 守卫/过滤器/拦截器属内部装配件，不在此导出（经 FoundationModule 全局注册）。
 */
export * from './constants/metadata.constants.js';
export * from './error-codes.js';
export * from './exceptions/biz.exception.js';
export * from './responses/api-response.js';
export * from './responses/page.vo.js';
export * from './decorators/public.decorator.js';
export * from './decorators/roles.decorator.js';
export * from './decorators/audit.decorator.js';
export * from './decorators/idempotent.decorator.js';
export * from './decorators/current-user.decorator.js';
export * from './dto/id-param.dto.js';
export * from './dto/pagination.dto.js';
export * from './utils/query.util.js';
