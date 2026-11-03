import { DynamicModule, Module } from '@nestjs/common';
import type { Provider } from '@nestjs/common';
import { AUDIT_SINK } from '../../contracts/index.js';
import { AuditController } from './audit.controller.js';
import { AuditService } from './audit.service.js';
import { PrismaAuditSink } from './prisma-audit.sink.js';

/**
 * 审计模块（DynamicModule）：
 * 默认绑定 AUDIT_SINK → PrismaAuditSink；extraProviders 追加在同 Token 默认实现之后，
 * Nest 同模块内后注册者生效（last-wins），业务借此整体替换存储实现。
 */
@Module({})
export class AuditModule {
  static forRoot(extraProviders: Provider[] = []): DynamicModule {
    return {
      module: AuditModule,
      controllers: [AuditController],
      providers: [AuditService, { provide: AUDIT_SINK, useClass: PrismaAuditSink }, ...extraProviders],
      exports: [AuditService],
    };
  }
}
