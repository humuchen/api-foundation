import { Module } from '@nestjs/common';
import { AUDIT_SINK, FoundationModule } from '@humuchen/foundation';
import { HealthModule } from '@humuchen/foundation/health';
import { MemoryAuditSink } from './extensions/memory-audit.sink.js';

/**
 * 业务根模块：底座一行装配（FoundationModule.forRoot），业务模块并列追加。
 * 扩展点（由轻到重）：L1 config 覆盖 → L2 replacements DI 替换 → L3 事件 → L4 装饰器。
 * 可选：通用后台管理系统模块 —— AdminModule.forRoot({ crudEntities: [...] })，
 * 一行获得 RBAC/菜单动态路由/通用 CRUD/字典/配置/审计能力（见 docs/admin-module.md 场景适配步骤）。
 */
@Module({
  imports: [
    FoundationModule.forRoot({
      config: { app: { port: __PORT__ } },
      replacements: [{ provide: AUDIT_SINK, useClass: MemoryAuditSink }]
    }),
    HealthModule
  ]
})
export class AppModule {}
