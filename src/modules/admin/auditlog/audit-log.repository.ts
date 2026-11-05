import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infra/database/prisma.service.js';
import type { AuditEntry } from '../../../contracts/index.js';

export interface AuditLogPageParams {
  page: number;
  pageSize: number;
  order: Record<string, 'ASC' | 'DESC'>;
  action?: string;
  actorUsername?: string;
  success?: boolean;
  tenantId?: string;
  start?: string;
  end?: string;
}

/**
 * 审计查询仓储：直查底座 audit_logs 表（默认持久化介质，与 PrismaAuditSink 同源）。
 * 扩展说明：业务经 L2 替换 AUDIT_SINK 更换审计存储时，本仓储即审计查询的对应适配点
 * （保持 AuditEntry 形态输出即可，接口语义不变）。
 */
@Injectable()
export class AuditLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async page(params: AuditLogPageParams): Promise<{ list: AuditEntry[]; total: number }> {
    const where: Prisma.AuditLogWhereInput = {};
    if (params.action) {
      // 支持前缀通配（admin:role:*）或全码精确
      where.action = params.action.endsWith('*') && !params.action.slice(0, -1).includes('*')
        ? { startsWith: params.action.slice(0, -1) }
        : params.action;
    }
    if (params.actorUsername) where.actorUsername = params.actorUsername;
    if (params.success !== undefined) where.success = params.success;
    if (params.tenantId) where.tenantId = params.tenantId;
    if (params.start || params.end) {
      where.createdAt = {
        ...(params.start ? { gte: new Date(params.start) } : {}),
        ...(params.end ? { lte: new Date(params.end) } : {}),
      };
    }

    const [field, dir] = Object.entries(params.order)[0] ?? ['createdAt', 'DESC'];
    const orderBy = { [field]: dir.toLowerCase() as 'asc' | 'desc' };
    const skip = (params.page - 1) * params.pageSize;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({ where, orderBy, skip, take: params.pageSize }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { list: rows.map((row) => this.toEntry(row)), total };
  }

  /** 行记录 → AuditEntry（与 PrismaAuditSink.toEntry 同构；bodyJson 反序列化容错） */
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
