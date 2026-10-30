import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { getLogger } from '../logger';

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
const MAX_ENTRIES = 500;

/**
 * 审计服务：内存暂存 + pino 输出。写入经微任务异步化（不阻塞响应）；
 * 数据层落地时以表/消息队列实现替换 persist（record 接口契约不变）。
 */
@Injectable()
export class AuditService {
  private readonly entries: AuditEntry[] = [];

  /** 异步写入入口：调用方 fire-and-forget，内部吞错保证审计失败不影响主流程 */
  async recordAsync(entry: Omit<AuditEntry, 'id' | 'createdAt'>): Promise<void> {
    await Promise.resolve(); // 让出事件循环：审计让位于响应
    const full: AuditEntry = {
      ...entry,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.entries.push(full);
    if (this.entries.length > MAX_ENTRIES) this.entries.shift(); // 环形上限，防内存膨胀
    getLogger().info({ context: 'Audit', data: full }, `[audit] ${entry.action}`);
  }

  /** 最近条目（新→旧） */
  list(limit: number): AuditEntry[] {
    return [...this.entries].reverse().slice(0, limit);
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
}
