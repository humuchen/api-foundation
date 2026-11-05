import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infra/database/prisma.service.js';

/** 角色实体（应用层形态；行记录经 toEntity 映射，时间转 ISO 字符串） */
export interface RoleEntity {
  id: string;
  code: string;
  name: string;
  description: string | null;
  builtin: boolean;
  sort: number;
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 权限点实体 */
export interface PermissionEntity {
  id: string;
  code: string;
  name: string;
  resource: string;
  action: string;
  type: string;
  description: string | null;
  sort: number;
  createdAt: string;
  updatedAt: string;
}

type RoleRow = Prisma.AdminRoleGetPayload<Record<string, never>>;
type PermissionRow = Prisma.AdminPermissionGetPayload<Record<string, never>>;

/**
 * RBAC 仓储 —— 角色 / 权限点 / 角色-权限绑定 / 用户-角色绑定四组数据的持久化访问。
 * 约定与 user.repository 一致：无 Prisma relation，跨表组装在仓储内手动完成；
 * P2025 → null；删除用 deleteMany 判 count。
 */
@Injectable()
export class RbacRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── 角色 ────────────────────────────────────────────────────

  async listRoles(): Promise<RoleEntity[]> {
    const rows = await this.prisma.adminRole.findMany({
      orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((row) => this.toRoleEntity(row));
  }

  async findRoleById(id: string): Promise<RoleEntity | null> {
    const row = await this.prisma.adminRole.findUnique({ where: { id } });
    return row ? this.toRoleEntity(row) : null;
  }

  async findRoleByCode(code: string): Promise<RoleEntity | null> {
    const row = await this.prisma.adminRole.findUnique({ where: { code } });
    return row ? this.toRoleEntity(row) : null;
  }

  async createRole(data: {
    code: string;
    name: string;
    description?: string;
    sort: number;
    disabled: boolean;
  }): Promise<RoleEntity> {
    const row = await this.prisma.adminRole.create({ data });
    return this.toRoleEntity(row);
  }

  async updateRole(
    id: string,
    patch: { name?: string; description?: string | null; sort?: number; disabled?: boolean },
  ): Promise<RoleEntity | null> {
    const data: Prisma.AdminRoleUpdateInput = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.sort !== undefined) data.sort = patch.sort;
    if (patch.disabled !== undefined) data.disabled = patch.disabled;
    try {
      const row = await this.prisma.adminRole.update({ where: { id }, data });
      return this.toRoleEntity(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') return null;
      throw e;
    }
  }

  /** 返回是否删除成功（builtin 保护在服务层判断） */
  async deleteRole(id: string): Promise<boolean> {
    const result = await this.prisma.adminRole.deleteMany({ where: { id } });
    return result.count > 0;
  }

  /** 角色当前被多少用户绑定（删除前置校验） */
  async countRoleBindings(roleId: string): Promise<number> {
    return this.prisma.adminUserRole.count({ where: { roleId } });
  }

  // ── 权限点 ──────────────────────────────────────────────────

  async listPermissions(resource?: string): Promise<PermissionEntity[]> {
    const rows = await this.prisma.adminPermission.findMany({
      where: resource ? { resource } : undefined,
      orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((row) => this.toPermissionEntity(row));
  }

  async findPermissionByCode(code: string): Promise<PermissionEntity | null> {
    const row = await this.prisma.adminPermission.findUnique({ where: { code } });
    return row ? this.toPermissionEntity(row) : null;
  }

  async findPermissionsByCodes(codes: string[]): Promise<PermissionEntity[]> {
    if (!codes.length) return [];
    const rows = await this.prisma.adminPermission.findMany({ where: { code: { in: codes } } });
    return rows.map((row) => this.toPermissionEntity(row));
  }

  async createPermission(data: {
    code: string;
    name: string;
    resource: string;
    action: string;
    type: string;
    description?: string;
    sort: number;
  }): Promise<PermissionEntity> {
    const row = await this.prisma.adminPermission.create({ data });
    return this.toPermissionEntity(row);
  }

  async deletePermission(id: string): Promise<boolean> {
    // 先清绑定再删权限点，保持绑定表不悬挂
    await this.prisma.$transaction([
      this.prisma.adminRolePermission.deleteMany({ where: { permissionId: id } }),
      this.prisma.adminPermission.deleteMany({ where: { id } }),
    ]);
    return true;
  }

  // ── 角色-权限绑定 ───────────────────────────────────────────

  /** 全量替换角色授权（事务内先清后建） */
  async replaceRolePermissions(roleId: string, permissionIds: string[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.adminRolePermission.deleteMany({ where: { roleId } }),
      this.prisma.adminRolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
      }),
    ]);
  }

  /** 角色当前授权的权限码（授权查询/回显用） */
  async listRolePermissionCodes(roleId: string): Promise<string[]> {
    const bindings = await this.prisma.adminRolePermission.findMany({ where: { roleId } });
    if (!bindings.length) return [];
    const rows = await this.prisma.adminPermission.findMany({
      where: { id: { in: bindings.map((b) => b.permissionId) } },
      select: { code: true },
    });
    return rows.map((r) => r.code);
  }

  // ── 用户-角色绑定 ───────────────────────────────────────────

  /** 用户绑定的角色（详情，含禁用角色：展示真实绑定） */
  async listRolesByUserId(userId: string): Promise<RoleEntity[]> {
    const bindings = await this.prisma.adminUserRole.findMany({ where: { userId } });
    if (!bindings.length) return [];
    const rows = await this.prisma.adminRole.findMany({
      where: { id: { in: bindings.map((b) => b.roleId) } },
      orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((row) => this.toRoleEntity(row));
  }

  /** 用户绑定且启用的角色 code（权限解析主通道） */
  async findEnabledRoleCodesByUserId(userId: string): Promise<string[]> {
    const bindings = await this.prisma.adminUserRole.findMany({ where: { userId } });
    if (!bindings.length) return [];
    const roles = await this.prisma.adminRole.findMany({
      where: { id: { in: bindings.map((b) => b.roleId) }, disabled: false },
      select: { code: true },
    });
    return roles.map((r) => r.code);
  }

  /** 给定角色码中存在且启用的角色码（JWT 快照角色的实时校准） */
  async findEnabledRoleCodesByCodes(codes: string[]): Promise<string[]> {
    if (!codes.length) return [];
    const roles = await this.prisma.adminRole.findMany({
      where: { code: { in: codes }, disabled: false },
      select: { code: true },
    });
    return roles.map((r) => r.code);
  }

  async replaceUserRoles(userId: string, roleIds: string[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.adminUserRole.deleteMany({ where: { userId } }),
      this.prisma.adminUserRole.createMany({
        data: roleIds.map((roleId) => ({ userId, roleId })),
      }),
    ]);
  }

  /** 绑定目标用户是否存在（users.id） */
  async userExists(userId: string): Promise<boolean> {
    const row = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    return row !== null;
  }

  // ── 权限解析（实时通道） ────────────────────────────────────

  /** 角色码集合 → 权限码全集（禁用角色不参与） */
  async findPermissionCodesByRoleCodes(roleCodes: string[]): Promise<string[]> {
    if (!roleCodes.length) return [];
    const roles = await this.prisma.adminRole.findMany({
      where: { code: { in: roleCodes }, disabled: false },
      select: { id: true },
    });
    if (!roles.length) return [];
    const bindings = await this.prisma.adminRolePermission.findMany({
      where: { roleId: { in: roles.map((r) => r.id) } },
      select: { permissionId: true },
    });
    if (!bindings.length) return [];
    const perms = await this.prisma.adminPermission.findMany({
      where: { id: { in: [...new Set(bindings.map((b) => b.permissionId))] } },
      select: { code: true },
    });
    return perms.map((p) => p.code);
  }

  // ── 映射 ────────────────────────────────────────────────────

  private toRoleEntity(row: RoleRow): RoleEntity {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      builtin: row.builtin,
      sort: row.sort,
      disabled: row.disabled,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toPermissionEntity(row: PermissionRow): PermissionEntity {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      resource: row.resource,
      action: row.action,
      type: row.type,
      description: row.description,
      sort: row.sort,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
