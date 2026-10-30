import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditEntry, AuditService } from './audit.service';
import { AuditQueryDto } from './audit.dto';

@ApiTags('audit')
@ApiBearerAuth()
@Roles('admin')
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: '最近审计记录（admin；新→旧）' })
  list(@Query() query: AuditQueryDto): { total: number; list: AuditEntry[] } {
    const list = this.auditService.list(query.limit);
    return { total: list.length, list };
  }
}
