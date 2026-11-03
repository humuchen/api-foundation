/**
 * SPI 契约：审计存储（L2 扩展点）。
 *
 * 核心包将审计的「编排」与「存储」分离：
 *  - AuditService（infra/audit）：条目构造、脱敏、异步编排、日志输出 —— 固定不变
 *  - AuditSink（本契约）：条目的持久化与查询 —— 默认 Prisma 实现，业务可整体替换
 *
 * 替换方式（业务项目 AppModule）：
 *   FoundationModule.forRoot({
 *     replacements: [{ provide: AUDIT_SINK, useClass: MyAuditSink }],
 *   })
 */
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

/** DI Token：审计存储实现。同 Token 的 replacements 后注册者生效（last-wins） */
export const AUDIT_SINK = Symbol('AUDIT_SINK');

/** 审计存储契约：record 不应向调用方抛出（存储失败自行降级/告警），服务层另有兜底 */
export interface AuditSink {
  /** 异步持久化单条审计条目（调用方 fire-and-forget，不阻塞响应） */
  record(entry: AuditEntry): Promise<void>;
  /** 最近条目（新→旧），最多 limit 条 */
  list(limit: number): Promise<AuditEntry[]>;
}
