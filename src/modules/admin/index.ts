/**
 * admin 通用后台管理系统模块出口：
 * AdminModule（forRoot 装配）、装配与契约类型、@RequirePerm 装饰器、CrudRegistry（运行时注册入口）。
 */
export * from './admin.module.js';
export * from './admin.types.js';
export * from './admin.contracts.js';
export { RequirePerm, PERM_KEY } from './rbac/perm.decorator.js';
export type { PermMeta } from './rbac/perm.decorator.js';
export { PERM_WILDCARD } from './rbac/rbac.service.js';
export { CrudRegistry } from './crud/crud.registry.js';
export type { AdminBootstrapVo } from './bootstrap/bootstrap.service.js';
export type { MenuNode, MenuEntity } from './menu/menu.repository.js';
export type { RoleEntity, PermissionEntity } from './rbac/rbac.repository.js';
export type { DictTypeEntity, DictItemEntity } from './dict/dict.repository.js';
export type { SysConfigEntity } from './sysconfig/sysconfig.repository.js';
