import type { CrudEntityDefinition } from './admin.contracts.js';

/** DI Token：通配全部权限的超管角色 code（RbacModule.forRoot 绑定，缺省 'admin'） */
export const ADMIN_SUPER_ROLE = Symbol('ADMIN_SUPER_ROLE');

/**
 * AdminModule.forRoot(options) 装配配置 —— admin 模块的 L1 配置扩展点。
 * 逐项均可缺省：零配置即得完整后台管理域（RBAC/菜单/字典/配置/审计/引擎 + 种子数据）。
 */
export interface AdminModuleOptions {
  /**
   * 配置式注册进通用 CRUD 引擎的业务实体定义（典型场景切换的主通道，
   * 见 docs/admin-module.md「场景适配」）；与运行时 CrudRegistry.register 等价。
   */
  crudEntities?: CrudEntityDefinition[];
  /**
   * 注册 @RequirePerm 实时权限守卫（APP_GUARD，后于底座 RolesGuard 执行）。
   * 缺省 true；置 false 时退回纯 @Roles 粗粒度（JWT 快照）模式。
   */
  enablePermissionGuard?: boolean;
  /**
   * 幂等种子：内置角色/权限点/菜单/字典/UI 配置/超管绑定（upsert 不覆盖已有数据）。
   * 缺省 true；生产可置 false 改由迁移脚本初始化。
   */
  seed?: boolean;
  /** 通配全部权限的超管角色 code，缺省 'admin' */
  superRole?: string;
}
