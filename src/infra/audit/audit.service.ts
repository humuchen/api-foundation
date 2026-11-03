import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AUDIT_SINK } from '../../contracts/audit-sink.js';
import type { AuditEntry, AuditSink } from '../../contracts/audit-sink.js';
import { getLogger } from '../logger/index.js';

/** 条目类型自 contracts 再导出，保持既有导入路径（infra/audit）兼容 */
export type { AuditEntry } from '../../contracts/audit-sink.js';

/** 敏感字段（键名匹配即脱敏，不区分大小写） */
const MASK_KEYS = new Set(['password', 'passwordhash', 'token', 'accesstoken', 'secret']);

/**
 * 审计服务（编排层）：条目补全（id/createdAt）→ 委托 AUDIT_SINK 持久化 → 结构化日志。
 * 存储实现默认为 PrismaAuditSink，业务可经 FoundationModule.forRoot({ replacements })
 * 以同 Token 整体替换（L2 扩展点）；编排/脱敏逻辑保持稳定，属核心契约。
 */
@Injectable()
export class AuditService {
  constructor(@Inject(AUDIT_SINK) private readonly sink: AuditSink) {}

  /** 异步写入入口：调用方 fire-and-forget，内部吞错保证审计失败不影响主流程 */
  async recordAsync(entry: Omit<AuditEntry, 'id' | 'createdAt'>): Promise<void> {
    await Promise.resolve(); // 让出事件循环：审计让位于响应
    const full: AuditEntry = {
      ...entry,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    try {
      await this.sink.record(full);
    } catch (err) {
      // 兜底自定义 Sink 违约抛错：审计失败不向主流程传播
      getLogger().warn({ err }, '[audit] 审计存储抛出异常，已忽略');
    }
    getLogger().info({ context: 'Audit', data: full }, `[audit] ${entry.action}`);
  }

  /** 最近条目（新→旧）；查询语义由 Sink 实现决定（含内存降级回退） */
  async list(limit: number): Promise<AuditEntry[]> {
    return this.sink.list(limit);
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
