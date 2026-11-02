import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import { getLogger } from '../logger/index.js';

/** 审计日志条目：who / when / what / 入参摘要 / 结果 / 链路 / 租户 */
export interface AuditEntry {
  id: string;
  requestId: string;
  /** 租户上下文（X-Tenant-Id；未携带为 null） */
  tenantId: string | null;
  action: string;
  method: string;
  path: string;
  /** 操作者（公开端点如登录时为 null） */
  actorId: string | null;
  actorUsername: string | null;
  /** 脱敏后的入参摘要（仅 @Audit(includeBody) 时记录） */
  body?: unknown;
  success: boolean;
  durationMs: number;
  createdAt: string;
}

/** 敏感字段（键名匹配即脱敏，不区分大小写） */
const MASK_KEYS = new Set(['password', 'passwordhash', 'token', 'accesstoken', 'secret']);

/** 内存降级缓冲上限（仅在数据库写入失败时启用，防内存膨胀） */
const MAX_MEMORY_ENTRIES = 500;

/**
 * 审计服务：主路径持久化至数据库（Prisma/AuditLog），失败降级内存环形缓冲。
 * 写入异步化（fire-and-forget），审计失败不影响主流程；每次写入均同步输出 pino，
 * 保证日志链路不依赖存储可用性。查询优先读数据库，数据库异常时回退内存缓冲。
 */
@Injectable()
export class AuditService {
  /** 降级缓冲：仅数据库写入失败时暂存，进程内可见 */
  private readonly memoryFallback: AuditEntry[] = [];

  constructor(private readonly prisma: PrismaService) {}

  /** 异步写入入口：调用方 fire-and-forget，内部吞错保证审计失败不影响主流程 */
  async recordAsync(entry: Omit<AuditEntry, 'id' | 'createdAt'>): Promise<void> {
    await Promise.resolve(); // 让出事件循环：审计让位于响应
    const full: AuditEntry = {
      ...entry,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    try {
      await this.prisma.auditLog.create({
        data: {
          id: full.id,
          requestId: full.requestId,
          tenantId: full.tenantId,
          action: full.action,
          method: full.method,
          path: full.path,
          actorId: full.actorId,
          actorUsername: full.actorUsername,
          bodyJson: full.body === undefined ? null : JSON.stringify(full.body),
          success: full.success,
          durationMs: full.durationMs,
          createdAt: new Date(full.createdAt),
        },
      });
    } catch (err) {
      // 降级：数据库不可用时暂存内存（进程内仍可查），并告警提示修复存储
      this.memoryFallback.push(full);
      if (this.memoryFallback.length > MAX_MEMORY_ENTRIES) this.memoryFallback.shift();
      getLogger().warn({ err }, '[audit] 数据库持久化失败，已降级内存暂存');
    }
    getLogger().info({ context: 'Audit', data: full }, `[audit] ${entry.action}`);
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

  /** 入参脱敏：命中敏感键的对象值替换为 '***'（递归一层 + 数组元素） */
  mask(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((v) => this.mask(v));
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = MASK_KEYS.has(k.toLowerCase()) ? '***' : this.mask(v);
      }
      return out;
    }
    return value;
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
