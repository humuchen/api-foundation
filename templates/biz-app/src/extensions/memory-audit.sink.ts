import { Injectable } from '@nestjs/common';
import { AUDIT_SINK } from '@humuchen/foundation/contracts';
import type { AuditEntry, AuditSink } from '@humuchen/foundation/contracts';

/**
 * L2 扩展示例：审计存储替换（默认 PrismaAuditSink 落库；本实现仅内存暂存）。
 * 生产可按需实现写 Kafka/ES 等；核心侧编排/脱敏逻辑零改动。
 */
@Injectable()
export class MemoryAuditSink implements AuditSink {
  private static readonly MAX = 100;
  private readonly entries: AuditEntry[] = [];

  async record(entry: AuditEntry): Promise<void> {
    this.entries.unshift(entry);
    if (this.entries.length > MemoryAuditSink.MAX) this.entries.pop();
  }

  async list(limit: number): Promise<AuditEntry[]> {
    return this.entries.slice(0, limit);
  }
}

export { AUDIT_SINK };
