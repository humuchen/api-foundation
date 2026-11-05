import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Audit } from '../../../common/decorators/audit.decorator.js';
import { IdParamDto } from '../../../common/dto/id-param.dto.js';
import { RequirePerm } from './perm.decorator.js';
import {
  BindUserRolesDto,
  CreatePermissionDto,
  CreateRoleDto,
  GrantPermissionsDto,
  UpdateRoleDto,
  UserIdParamDto,
} from './rbac.dto.js';
import type { PermissionEntity, RoleEntity } from './rbac.repository.js';
import { RbacService } from './rbac.service.js';

/**
 * RBAC 管理端点：角色 CRUD、权限点查询/创建、角色授权、用户角色绑定。
 * 全部端点经 @RequirePerm 实时鉴权（超管通配）；写操作带审计。
 * 路由声明顺序：静态段（roles/permissions/users）先于动态段。
 */
@ApiTags('admin/rbac')
@ApiBearerAuth()
@Controller('admin/rbac')
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  // ── 角色 ────────────────────────────────────────────────────

  @Get('roles')
  @RequirePerm('admin:role:list')
  @ApiOperation({ summary: '角色列表（admin:role:list；按 sort/createdAt 升序）' })
  listRoles(): Promise<RoleEntity[]> {
    return this.rbacService.listRoles();
  }

  @Post('roles')
  @RequirePerm('admin:role:create')
  @Audit('admin:role:create', { includeBody: true })
  @ApiOperation({ summary: '创建角色（admin:role:create）' })
  createRole(@Body() dto: CreateRoleDto): Promise<RoleEntity> {
    return this.rbacService.createRole(dto);
  }

  @Patch('roles/:id')
  @RequirePerm('admin:role:update')
  @Audit('admin:role:update', { includeBody: true })
  @ApiOperation({ summary: '更新角色（admin:role:update；code 创建后不可改）' })
  updateRole(@Param() params: IdParamDto, @Body() dto: UpdateRoleDto): Promise<RoleEntity> {
    return this.rbacService.updateRole(params.id, dto);
  }

  @Delete('roles/:id')
  @RequirePerm('admin:role:delete')
  @Audit('admin:role:delete')
  @ApiOperation({ summary: '删除角色（admin:role:delete；内置角色与有绑定角色拒绝）' })
  deleteRole(@Param() params: IdParamDto): Promise<{ id: string }> {
    return this.rbacService.deleteRole(params.id);
  }

  // ── 权限点 ──────────────────────────────────────────────────

  @Get('permissions')
  @RequirePerm('admin:permission:list')
  @ApiOperation({ summary: '权限点列表（admin:permission:list；?resource= 按资源域过滤）' })
  listPermissions(@Query('resource') resource?: string): Promise<PermissionEntity[]> {
    return this.rbacService.listPermissions(resource);
  }

  @Post('permissions')
  @RequirePerm('admin:permission:create')
  @Audit('admin:permission:create', { includeBody: true })
  @ApiOperation({ summary: '创建权限点（admin:permission:create；业务域自定义权限入口）' })
  createPermission(@Body() dto: CreatePermissionDto): Promise<PermissionEntity> {
    return this.rbacService.createPermission(dto);
  }

  // ── 角色授权 ────────────────────────────────────────────────

  @Get('roles/:id/permissions')
  @RequirePerm('admin:role:list')
  @ApiOperation({ summary: '角色已授权权限码（admin:role:list；授权面板回显）' })
  listRolePermissions(@Param() params: IdParamDto): Promise<{ codes: string[] }> {
    return this.rbacService.listRolePermissionCodes(params.id).then((codes) => ({ codes }));
  }

  @Put('roles/:id/permissions')
  @RequirePerm('admin:role:grant')
  @Audit('admin:role:grant', { includeBody: true })
  @ApiOperation({ summary: '全量替换角色授权（admin:role:grant；即时生效）' })
  grantRolePermissions(
    @Param() params: IdParamDto,
    @Body() dto: GrantPermissionsDto,
  ): Promise<{ granted: number }> {
    return this.rbacService.grantRolePermissions(params.id, dto);
  }

  // ── 用户角色绑定 ────────────────────────────────────────────

  @Get('users/:userId/roles')
  @RequirePerm('admin:user-role:list')
  @ApiOperation({ summary: '用户绑定角色（admin:user-role:list；含禁用角色）' })
  listUserRoles(@Param() params: UserIdParamDto): Promise<RoleEntity[]> {
    return this.rbacService.listUserRoles(params.userId);
  }

  @Put('users/:userId/roles')
  @RequirePerm('admin:user-role:bind')
  @Audit('admin:user-role:bind', { includeBody: true })
  @ApiOperation({ summary: '全量替换用户角色绑定（admin:user-role:bind；即时生效，无需重新登录）' })
  bindUserRoles(
    @Param() params: UserIdParamDto,
    @Body() dto: BindUserRolesDto,
  ): Promise<{ bound: number }> {
    return this.rbacService.bindUserRoles(params.userId, dto);
  }
}
