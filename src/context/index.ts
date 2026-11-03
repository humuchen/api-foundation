/**
 * 请求上下文原语（AsyncLocalStorage）：分层位于 common 之下——
 * common（过滤器/拦截器取 requestId）与 infra（logger 注入字段）都可依赖本层，
 * 反向不成立。原实现位于 infra/logger，为满足依赖防腐规则（common 不得依赖 infra）下沉至此。
 */
export * from './request-context.js';
export * from './request-context.middleware.js';
