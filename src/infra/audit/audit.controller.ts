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
  @ApiOperation({ summary: '最近审计记录（admin；新→旧；持久化于数据库，异常时回退内存）' })
  async list(@Query() query: AuditQueryDto): Promise<{ total: number; list: AuditEntry[] }> {
    const list = await this.auditService.list(query.limit);
    return { total: list.length, list };
  }
}
