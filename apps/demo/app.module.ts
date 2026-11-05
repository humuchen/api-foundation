import { Module } from '@nestjs/common';
import { FoundationModule } from '../../src/factory/index.js';
import { AdminModule } from '../../src/modules/admin/index.js';
import { HealthModule } from '../../src/health/index.js';
import { HelloModule } from '../../src/modules/hello/index.js';
import { UserModule } from '../../src/modules/user/index.js';
import { DEMO_PRODUCT_ENTITY } from './demo-product.entity.js';

/**
 * demo 宿主根模块（业务项目的最小样板）：
 * 底座经 FoundationModule.forRoot() 一行装配，业务模块并列追加。
 * AdminModule.forRoot()：通用后台管理系统模块（RBAC/菜单/字典/配置/审计/通用 CRUD 引擎）。
 *
 * 真实业务项目可传入 config 覆盖与 replacements（L1/L2 扩展点）：
 *   FoundationModule.forRoot({ config: {...}, replacements: [{ provide: AUDIT_SINK, useClass: MySink }] })
 * AdminModule 扩展点：
 *   crudEntities —— 配置式注册业务实体定义（见 demo-product.entity.ts）
 *   enablePermissionGuard / seed / superRole —— 权限守卫、种子与超管角色开关
 */
@Module({
  imports: [
    FoundationModule.forRoot(),
    HelloModule,
    UserModule,
    AdminModule.forRoot({ crudEntities: [DEMO_PRODUCT_ENTITY] }),
    HealthModule,
  ],
})
export class AppModule {}
