import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Audit } from '../../../common/decorators/audit.decorator.js';
import { IdParamDto } from '../../../common/dto/id-param.dto.js';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import {
  CreateDictItemDto,
  CreateDictTypeDto,
  UpdateDictItemDto,
  UpdateDictTypeDto,
} from './dict.dto.js';
import type { DictItemEntity, DictTypeEntity } from './dict.repository.js';
import { DictService } from './dict.service.js';
import { RequirePerm } from '../rbac/perm.decorator.js';

/** 字典项查询参数：?includeDisabled=true 时返回含停用项（管理端） */
class DictItemQueryDto {
  @ApiPropertyOptional({ default: false, description: '是否包含停用项' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeDisabled?: boolean;
}

/**
 * 字典管理：类型/项 CRUD + 按编码读取（登录即可读，供表单选项渲染）。
 * 路由声明顺序：静态段（types/items 段内组合）先于动态 :id。
 */
@ApiTags('admin/dicts')
@ApiBearerAuth()
@Controller('admin/dicts')
export class DictController {
  constructor(private readonly dictService: DictService) {}

  // ── 类型 ────────────────────────────────────────────────────

  @Get('types')
  @RequirePerm('admin:dict:list')
  @ApiOperation({ summary: '字典类型列表（admin:dict:list）' })
  listTypes(): Promise<DictTypeEntity[]> {
    return this.dictService.listTypes();
  }

  @Post('types')
  @RequirePerm('admin:dict:create')
  @Audit('admin:dict:create', { includeBody: true })
  @ApiOperation({ summary: '创建字典类型（admin:dict:create）' })
  createType(@Body() dto: CreateDictTypeDto): Promise<DictTypeEntity> {
    return this.dictService.createType(dto);
  }

  @Patch('types/:id')
  @RequirePerm('admin:dict:update')
  @Audit('admin:dict:update', { includeBody: true })
  @ApiOperation({ summary: '更新字典类型（admin:dict:update；code 不可改）' })
  updateType(@Param() params: IdParamDto, @Body() dto: UpdateDictTypeDto): Promise<DictTypeEntity> {
    return this.dictService.updateType(params.id, dto);
  }

  @Delete('types/:id')
  @RequirePerm('admin:dict:delete')
  @Audit('admin:dict:delete')
  @ApiOperation({ summary: '删除字典类型（admin:dict:delete；连同全部字典项）' })
  deleteType(@Param() params: IdParamDto): Promise<{ id: string }> {
    return this.dictService.deleteType(params.id);
  }

  // ── 项 ──────────────────────────────────────────────────────

  @Get(':code/items')
  @ApiOperation({ summary: '字典项列表（任意登录用户；前端表单选项数据源）' })
  @ApiQuery({ name: 'includeDisabled', required: false, type: Boolean })
  listItems(@Param('code') typeCode: string, @Query() query: DictItemQueryDto): Promise<DictItemEntity[]> {
    return this.dictService.listItems(typeCode, query.includeDisabled === true);
  }

  @Post(':code/items')
  @RequirePerm('admin:dict:create')
  @Audit('admin:dict:create', { includeBody: true })
  @ApiOperation({ summary: '创建字典项（admin:dict:create）' })
  createItem(@Param('code') typeCode: string, @Body() dto: CreateDictItemDto): Promise<DictItemEntity> {
    return this.dictService.createItem(typeCode, dto);
  }

  @Patch('items/:id')
  @RequirePerm('admin:dict:update')
  @Audit('admin:dict:update', { includeBody: true })
  @ApiOperation({ summary: '更新字典项（admin:dict:update；value 不可改）' })
  updateItem(@Param() params: IdParamDto, @Body() dto: UpdateDictItemDto): Promise<DictItemEntity> {
    return this.dictService.updateItem(params.id, dto);
  }

  @Delete('items/:id')
  @RequirePerm('admin:dict:delete')
  @Audit('admin:dict:delete')
  @ApiOperation({ summary: '删除字典项（admin:dict:delete）' })
  deleteItem(@Param() params: IdParamDto): Promise<{ id: string }> {
    return this.dictService.deleteItem(params.id);
  }
}
