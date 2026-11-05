import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto.js';

/** 审计查询（分页 + 多条件筛选；可排序白名单由服务层声明） */
export class AuditLogQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: '按审计动作过滤（支持前缀匹配，如 admin:role:*）' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;

  @ApiPropertyOptional({ description: '按操作者用户名精确过滤' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  actorUsername?: string;

  @ApiPropertyOptional({ description: '按结果过滤（true 成功 / false 失败）' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  success?: boolean;

  @ApiPropertyOptional({ description: '按租户过滤' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  tenantId?: string;

  @ApiPropertyOptional({ format: 'date-time', description: '起始时间（含）' })
  @IsOptional()
  @IsISO8601({}, { message: 'start 须为 ISO-8601 时间' })
  start?: string;

  @ApiPropertyOptional({ format: 'date-time', description: '结束时间（含）' })
  @IsOptional()
  @IsISO8601({}, { message: 'end 须为 ISO-8601 时间' })
  end?: string;
}
