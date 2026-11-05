import { Injectable } from '@nestjs/common';
import { buildPage, type PageVo } from '../../../common/responses/page.vo.js';
import { toQueryOptions } from '../../../common/utils/query.util.js';
import type { AuditEntry } from '../../../contracts/index.js';
import type { AuditLogQueryDto } from './audit-log.dto.js';
import { AuditLogRepository } from './audit-log.repository.js';

/** 审计可排序字段白名单（防排序注入） */
export const AUDIT_LOG_SORTABLE_FIELDS = ['createdAt', 'durationMs'];

/**
 * 审计查询服务：写路径由底座 AuditInterceptor/AUDIT_SINK 承担（含脱敏与降级），
 * 本服务补齐面向后台界面的分页/筛选/排序查询能力。
 */
@Injectable()
export class AuditLogService {
  constructor(private readonly repository: AuditLogRepository) {}

  async page(query: AuditLogQueryDto): Promise<PageVo<AuditEntry>> {
    const opts = toQueryOptions(query, AUDIT_LOG_SORTABLE_FIELDS);
    const { list, total } = await this.repository.page({
      page: opts.page,
      pageSize: opts.pageSize,
      order: opts.order,
      action: query.action,
      actorUsername: query.actorUsername,
      success: query.success,
      tenantId: query.tenantId,
      start: query.start,
      end: query.end,
    });
    return buildPage(list, total, opts.page, opts.pageSize);
  }
}
