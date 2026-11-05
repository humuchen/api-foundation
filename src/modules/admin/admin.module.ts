import { DynamicModule, Module } from '@nestjs/common';
import type { Provider } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { UserModule } from '../user/index.js';
import { AdminBootstrapController } from './bootstrap/bootstrap.controller.js';
import { AdminBootstrapService } from './bootstrap/bootstrap.service.js';
import { AuditLogController } from './auditlog/audit-log.controller.js';
import { AuditLogRepository } from './auditlog/audit-log.repository.js';
import { AuditLogService } from './auditlog/audit-log.service.js';
import { CrudController } from './crud/crud.controller.js';
import { CrudRegistry } from './crud/crud.registry.js';
import { CrudService } from './crud/crud.service.js';
import { DictController } from './dict/dict.controller.js';
import { DictRepository } from './dict/dict.repository.js';
import { DictService } from './dict/dict.service.js';
import { MenuController } from './menu/menu.controller.js';
import { MenuRepository } from './menu/menu.repository.js';
import { MenuService } from './menu/menu.service.js';
import { AdminSeed } from './seed/admin.seed.js';
import { PermissionGuard } from './rbac/perm.guard.js';
import { RbacController } from './rbac/rbac.controller.js';
import { RbacRepository } from './rbac/rbac.repository.js';
import { RbacService } from './rbac/rbac.service.js';
import { SysConfigController } from './sysconfig/sysconfig.controller.js';
import { SysConfigRepository } from './sysconfig/sysconfig.repository.js';
import { SysConfigService } from './sysconfig/sysconfig.service.js';
import type { AdminModuleOptions } from './admin.types.js';
import { ADMIN_SUPER_ROLE } from './admin.types.js';

/**
 * 通用后台管理系统模块（模块化 + 插件化）：
 *
 * 六个可独立替换的子域 + 一个聚合端点 + 一个引擎：
 *   rbac      权限/角色/授权/用户绑定（@RequirePerm 实时鉴权，超管通配）
 *   menu      菜单树/动态路由元数据/按权限过滤
 *   crud      通用 CRUD 引擎（实体定义注册 → 动态端点 + schema 元数据下发）
 *   dict      字典类型/项（表单选项数据源 + 引擎运行时校验）
 *   sysconfig 分组配置（ui 组承载多主题与响应式布局约定）
 *   auditlog  操作审计分页查询（写入复用底座 AuditInterceptor → AUDIT_SINK）
 *   bootstrap 聚合端点（user/permissions/menus/ui 一次拉取）
 *
 * 装配方式（业务侧一行接入）：
 *   @Module({ imports: [FoundationModule.forRoot(), AdminModule.forRoot()] })
 * 扩展点：
 *   - 配置式：AdminModule.forRoot({ crudEntities, enablePermissionGuard, seed, superRole })
 *   - 运行时：注入 CrudRegistry.register(definition)（业务模块 onModuleInit）
 *   - 子域 Service 均为普通 @Injectable：整体替换经自定义 DynamicModule 另行装配
 *
 * 说明：子域以文件目录组织（非独立 @Module）—— 由本模块统一装配以避免
 * 动态模块重复实例化（RbacService 等被多个子域共享消费）。
 */
@Module({})
export class AdminModule {
  static forRoot(options: AdminModuleOptions = {}): DynamicModule {
    const {
      crudEntities = [],
      enablePermissionGuard = true,
      seed = true,
      superRole = 'admin',
    } = options;

    const controllers = [
      AdminBootstrapController,
      RbacController,
      MenuController,
      DictController,
      SysConfigController,
      CrudController,
      AuditLogController,
    ];

    const providers: Provider[] = [
      // RBAC：实时权限解析与 @RequirePerm 守卫的依赖源
      RbacRepository,
      RbacService,
      { provide: ADMIN_SUPER_ROLE, useValue: superRole },
      // 菜单与动态路由
      MenuRepository,
      MenuService,
      // 字典（引擎 dict 字段校验依赖 DictService）
      DictRepository,
      DictService,
      // 系统配置（ui 组主题/布局下发）
      SysConfigRepository,
      SysConfigService,
      // 通用 CRUD 引擎：注册表工厂在装配期完成实体定义注册（fail-fast 校验）
      {
        provide: CrudRegistry,
        useFactory: (): CrudRegistry => {
          const registry = new CrudRegistry();
          for (const entity of crudEntities) registry.register(entity);
          return registry;
        },
      },
      CrudService,
      // 审计查询
      AuditLogRepository,
      AuditLogService,
      // bootstrap 聚合
      AdminBootstrapService,
      // 幂等种子（内置角色/权限点/菜单/字典/ui 配置/超管绑定）
      ...(seed ? [AdminSeed] : []),
      // @RequirePerm 实时权限守卫（APP_GUARD：位于底座 Throttler→Jwt→Roles 之后）
      ...(enablePermissionGuard ? [{ provide: APP_GUARD, useClass: PermissionGuard }] : []),
    ];

    return {
      module: AdminModule,
      imports: [UserModule], // bootstrap 聚合当前用户信息（UserService.findMe）
      controllers,
      providers,
    };
  }
}
