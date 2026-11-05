import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsUUID, Matches } from 'class-validator';
import { Audit } from '../../../common/decorators/audit.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { PaginationDto } from '../../../common/dto/pagination.dto.js';
import { ErrorCode } from '../../../common/error-codes.js';
import { BizException } from '../../../common/exceptions/biz.exception.js';
import type { AuthUser } from '../../../contracts/index.js';
import type { PageVo } from '../../../common/responses/page.vo.js';
import type { CrudEntityDefinition, CrudResourceSummary } from '../admin.contracts.js';
import { CRUD_RESOURCE_PATTERN } from './crud.registry.js';
import { CrudService } from './crud.service.js';

/**
 * 动态双段路由参数（/admin/crud/:resource/:id）：
 * 独立 DTO 显式声明两段（resource 校验合法资源段；id 校验 UUID），
 * 避免复用 IdParamDto 时因未声明的 resource 键触发 forbidNonWhitelisted。
 */
class ResourceIdParamDto {
  @ApiProperty({ description: '资源标识' })
  @Matches(CRUD_RESOURCE_PATTERN, { message: 'resource 段非法' })
  resource!: string;

  @ApiProperty({ format: 'uuid', description: '记录 ID' })
  @IsUUID('all', { message: 'id 须为合法 UUID' })
  id!: string;
}

/**
 * 动态分页解析：page/pageSize/sort 语义与全局 PaginationDto 对齐（手工校验），
 * 其余查询键原样保留作为 inFilter 字段入参（白名单收敛在 CrudService.buildWhere）。
 */
function toPagination(query: Record<string, unknown>): PaginationDto {
  const dto = new PaginationDto();
  const page = Number(query['page'] ?? dto.page);
  const pageSize = Number(query['pageSize'] ?? dto.pageSize);
  const details: Array<{ field: string; message: string }> = [];
  if (!Number.isInteger(page) || page < 1) {
    details.push({ field: 'page', message: 'page 须为 ≥ 1 的整数' });
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    details.push({ field: 'pageSize', message: 'pageSize 须为 1-100 的整数' });
  }
  const sort = query['sort'];
  if (sort !== undefined && (typeof sort !== 'string' || !/^\S+:(asc|desc)$/.test(sort))) {
    details.push({ field: 'sort', message: 'sort 格式须为 field:asc 或 field:desc' });
  }
  if (details.length > 0) {
    throw new BizException(ErrorCode.VALIDATION_FAILED, '参数校验失败', details);
  }
  dto.page = page;
  dto.pageSize = pageSize;
  if (typeof sort === 'string') dto.sort = sort;
  return dto;
}

/**
 * 通用 CRUD 动态端点：路由 /admin/crud/:resource 由注册表驱动，权限码动态校验
 * （CrudService.requirePermission，非静态 @RequirePerm —— 资源运行期才可知）。
 *
 * 端点集（readOnly 资源仅暴露前三个读端点）：
 *   GET    /admin/crud/_registry            已注册资源摘要
 *   GET    /admin/crud/:resource/schema     表格+表单元数据（前端渲染器数据源）
 *   GET    /admin/crud/:resource            分页（?page&pageSize&sort&<inFilter 字段>&keyword）
 *   GET    /admin/crud/:resource/:id        详情
 *   POST   /admin/crud/:resource            创建
 *   PATCH  /admin/crud/:resource/:id        更新（部分更新语义）
 *   DELETE /admin/crud/:resource/:id        删除
 * 声明顺序：静态段 _registry 先于 :resource；schema 端点先于 :id 详情。
 * 审计动作经 {resource} 占位符展开（如 crud:products:create）。
 */
@ApiTags('admin/crud')
@ApiBearerAuth()
@Controller('admin/crud')
export class CrudController {
  constructor(private readonly crudService: CrudService) {}

  @Get('_registry')
  @ApiOperation({ summary: '已注册 CRUD 资源摘要（任意登录用户；动态工作台数据源）' })
  registry(): CrudResourceSummary[] {
    return this.crudService.listResources();
  }

  @Get(':resource/schema')
  @ApiOperation({ summary: '资源元数据 schema（任意登录用户；表格列+表单项渲染契约）' })
  schema(@Param('resource') resource: string): CrudEntityDefinition {
    return this.crudService.getSchema(resource);
  }

  @Get(':resource')
  @ApiOperation({
    summary: '分页查询（动态权限 <prefix>:list；inFilter 字段作为查询参数，keyword 全文模糊）',
  })
  page(
    @Param('resource') resource: string,
    @Query() query: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
  ): Promise<PageVo<Record<string, unknown>>> {
    // 动态端点绑定原始 query（全局 ValidationPipe 的白名单无法预知 inFilter 字段），
    // 页参手工校验（语义与 PaginationDto 对齐），过滤字段白名单由 buildWhere 按定义收敛
    return this.crudService.page(resource, toPagination(query), query, user);
  }

  @Get(':resource/:id')
  @ApiOperation({ summary: '详情（动态权限 <prefix>:list）' })
  detail(@Param() params: ResourceIdParamDto, @CurrentUser() user: AuthUser): Promise<Record<string, unknown>> {
    return this.crudService.detail(params.resource, params.id, user);
  }

  @Post(':resource')
  @Audit('crud:{resource}:create', { includeBody: true })
  @ApiOperation({ summary: '创建（动态权限 <prefix>:create）' })
  create(
    @Param('resource') resource: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.crudService.create(resource, body, user);
  }

  @Patch(':resource/:id')
  @Audit('crud:{resource}:update', { includeBody: true })
  @ApiOperation({ summary: '更新（动态权限 <prefix>:update；部分更新语义，readOnly 字段剥离）' })
  update(
    @Param() params: ResourceIdParamDto,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.crudService.update(params.resource, params.id, body, user);
  }

  @Delete(':resource/:id')
  @Audit('crud:{resource}:delete')
  @ApiOperation({ summary: '删除（动态权限 <prefix>:delete）' })
  remove(@Param() params: ResourceIdParamDto, @CurrentUser() user: AuthUser): Promise<{ id: string }> {
    return this.crudService.remove(params.resource, params.id, user);
  }
}
