import { Module } from '@nestjs/common';
import { AUDIT_SINK, FoundationModule } from '@humuchen/foundation';
import { HealthModule } from '@humuchen/foundation/health';
import { MemoryAuditSink } from './extensions/memory-audit.sink.js';

/**
 * 业务根模块：底座一行装配（FoundationModule.forRoot），业务模块并列追加。
 * 扩展点（由轻到重）：L1 config 覆盖 → L2 replacements DI 替换 → L3 事件 → L4 装饰器。
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
