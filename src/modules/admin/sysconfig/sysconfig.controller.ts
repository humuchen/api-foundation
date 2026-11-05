import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Audit } from '../../../common/decorators/audit.decorator.js';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateSysConfigDto, UpdateSysConfigDto } from './sysconfig.dto.js';
import type { SysConfigEntity } from './sysconfig.repository.js';
import { SysConfigService } from './sysconfig.service.js';
import { RequirePerm } from '../rbac/perm.decorator.js';

/** 分组查询参数 */
class ConfigGroupQueryDto {
  @ApiPropertyOptional({ description: '按分组过滤（如 ui）' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  group?: string;
}

/**
 * 系统配置管理：全量/分组读取、键值 CRUD。
 * 读端点（全量/分组）仅要求登录 —— ui 组由前端启动时拉取以应用主题与布局。
 */
@ApiTags('admin/configs')
@ApiBearerAuth()
@Controller('admin/configs')
export class SysConfigController {
  constructor(private readonly sysConfigService: SysConfigService) {}

  @Get()
  @ApiOperation({ summary: '配置列表（?group= 过滤；登录即可读，ui 组供前端主题/布局）' })
  list(@Query() query: ConfigGroupQueryDto): Promise<SysConfigEntity[]> {
    return query.group ? this.sysConfigService.listByGroup(query.group) : this.sysConfigService.listAll();
  }

  @Post()
  @RequirePerm('admin:config:create')
  @Audit('admin:config:create', { includeBody: true })
  @ApiOperation({ summary: '创建配置（admin:config:create）' })
  create(@Body() dto: CreateSysConfigDto): Promise<SysConfigEntity> {
    return this.sysConfigService.create(dto);
  }

  @Put(':key')
  @RequirePerm('admin:config:update')
  @Audit('admin:config:update', { includeBody: true })
  @ApiOperation({ summary: '更新配置值（admin:config:update；主题/布局调整入口）' })
  update(@Param('key') key: string, @Body() dto: UpdateSysConfigDto): Promise<SysConfigEntity> {
    return this.sysConfigService.update(key, dto);
  }

  @Delete(':key')
  @RequirePerm('admin:config:delete')
  @Audit('admin:config:delete')
  @ApiOperation({ summary: '删除配置（admin:config:delete；内置配置拒绝）' })
  remove(@Param('key') key: string): Promise<{ key: string }> {
    return this.sysConfigService.delete(key);
  }
}
