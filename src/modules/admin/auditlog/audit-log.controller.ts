import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { PageVo } from '../../../common/responses/page.vo.js';
import type { AuditEntry } from '../../../contracts/index.js';
import { AuditLogQueryDto } from './audit-log.dto.js';
import { AuditLogService } from './audit-log.service.js';
import { RequirePerm } from '../rbac/perm.decorator.js';

/**
 * 操作审计查询（底座 GET /audit 最近条目之上的分页筛选版）。
 * 写入链路：@Audit → AuditInterceptor → AUDIT_SINK（见 infra/audit）；本端点仅读。
 */
@ApiTags('admin/audit-logs')
@ApiBearerAuth()
@Controller('admin/audit-logs')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @RequirePerm('admin:audit:list')
  @ApiOperation({
    summary:
      '分页查询审计记录（admin:audit:list；action 支持前缀通配 admin:role:*，success/actorUsername/tenantId/start/end 筛选）',
  })
  page(@Query() query: AuditLogQueryDto): Promise<PageVo<AuditEntry>> {
    return this.auditLogService.page(query);
  }
}
