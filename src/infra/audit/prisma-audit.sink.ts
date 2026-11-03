import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { getLogger } from '../logger/index.js';
import type { AuditEntry, AuditSink } from '../../contracts/index.js';

/** 内存降级缓冲上限（仅在数据库写入失败时启用，防内存膨胀） */
const MAX_MEMORY_ENTRIES = 500;

/**
 * AUDIT_SINK 默认实现：Prisma/AuditLog 持久化，失败降级内存环形缓冲。
 * record 吞错（存储异常不向调用方传播）；查询优先读数据库，异常时回退内存缓冲。
 * 替换实现请实现 contracts 的 AuditSink 接口并经 FoundationModule.forRoot 注入。
 */
@Injectable()
export class PrismaAuditSink implements AuditSink {
  private readonly memoryFallback: AuditEntry[] = [];

  constructor(private readonly prisma: PrismaService) {}

  /** 异步持久化：失败降级内存（进程内仍可查），并告警提示修复存储 */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          id: entry.id,
          requestId: entry.requestId,
          tenantId: entry.tenantId,
          action: entry.action,
          method: entry.method,
          path: entry.path,
          actorId: entry.actorId,
          actorUsername: entry.actorUsername,
          bodyJson: entry.body === undefined ? null : JSON.stringify(entry.body),
          success: entry.success,
          durationMs: entry.durationMs,
          createdAt: new Date(entry.createdAt),
        },
      });
    } catch (err) {
      this.memoryFallback.push(entry);
      if (this.memoryFallback.length > MAX_MEMORY_ENTRIES) this.memoryFallback.shift();
      getLogger().warn({ err }, '[audit] 数据库持久化失败，已降级内存暂存');
    }
  }

  /** 最近条目（新→旧）；优先数据库，异常时回退内存缓冲 */
  async list(limit: number): Promise<AuditEntry[]> {
    try {
      const rows = await this.prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      return rows.map((row) => this.toEntry(row));
    } catch {
      return [...this.memoryFallback].reverse().slice(0, limit);
    }
  }

  /** 行记录 → 应用层条目（bodyJson 反序列化；时间转 ISO 字符串） */
  private toEntry(row: {
    id: string;
    requestId: string;
    tenantId: string | null;
    action: string;
    method: string;
    path: string;
    actorId: string | null;
    actorUsername: string | null;
    bodyJson: string | null;
    success: boolean;
    durationMs: number;
    createdAt: Date;
  }): AuditEntry {
    let body: unknown;
    if (row.bodyJson) {
      try {
        body = JSON.parse(row.bodyJson);
      } catch {
        body = undefined;
      }
    }
    return {
      id: row.id,
      requestId: row.requestId,
      tenantId: row.tenantId,
      action: row.action,
      method: row.method,
      path: row.path,
      actorId: row.actorId,
      actorUsername: row.actorUsername,
      ...(body !== undefined ? { body } : {}),
      success: row.success,
      durationMs: row.durationMs,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
