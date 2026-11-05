import { Cache } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../../../contracts/index.js';
import { ErrorCode } from '../../../common/error-codes.js';
import { BizException } from '../../../common/exceptions/biz.exception.js';
import { ADMIN_SUPER_ROLE } from '../admin.types.js';
import {
  BindUserRolesDto,
  CreatePermissionDto,
  CreateRoleDto,
  GrantPermissionsDto,
  UpdateRoleDto,
} from './rbac.dto.js';
import type { PermissionEntity, RoleEntity } from './rbac.repository.js';
import { RbacRepository } from './rbac.repository.js';

/**
 * 权限解析缓存：版本号递增批量失效（Keyv 无前缀扫描，与 user 模块同一策略）。
 * 写操作（角色/授权/绑定变更）递增版本 → 所有用户的缓存键立即失效 → 下次解析回源。
 */
const PERM_CACHE_VERSION_KEY = 'admin:perm:ver';
const PERM_CACHE_TTL_MS = 30_000;
const PERM_CACHE_VERSION_TTL_MS = 86_400_000;

/** 通配哨兵：超管角色解析结果（requirePermission / 菜单过滤识别） */
export const PERM_WILDCARD = '*';

export type { RoleEntity, PermissionEntity };

/**
 * RBAC 服务：角色 / 权限点 / 授权 / 用户角色绑定 + 实时权限解析。
 *
 * 双轨设计（与底座 @Roles 的关系）：
 *  - @Roles（底座 RolesGuard）：JWT 内嵌 roles 快照，登录后变更需重新登录生效 —— 粗粒度角色墙；
 *  - @RequirePerm（本模块 PermissionGuard）：实时授权解析，绑定/授权变更即时生效 —— 细粒度权限点。
 * 解析来源 = 用户绑定角色（admin_user_roles）∪ JWT 快照中真实存在且启用的角色；
 * 超管角色（缺省 admin）通配全部权限点。
 */
@Injectable()
export class RbacService {
  constructor(
    private readonly repository: RbacRepository,
    private readonly cache: Cache,
    @Inject(ADMIN_SUPER_ROLE) private readonly superRole: string,
  ) {}

  // ── 角色 CRUD ───────────────────────────────────────────────

  async listRoles(): Promise<RoleEntity[]> {
    return this.repository.listRoles();
  }

  async createRole(dto: CreateRoleDto): Promise<RoleEntity> {
    if (await this.repository.findRoleByCode(dto.code)) {
      throw new BizException(ErrorCode.ADMIN_ROLE_CODE_CONFLICT);
    }
    try {
      const role = await this.repository.createRole({
        code: dto.code,
        name: dto.name,
        description: dto.description,
        sort: dto.sort ?? 0,
        disabled: dto.disabled ?? false,
      });
      await this.invalidatePermCache();
      return role;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BizException(ErrorCode.ADMIN_ROLE_CODE_CONFLICT);
      }
      throw e;
    }
  }

  async updateRole(id: string, dto: UpdateRoleDto): Promise<RoleEntity> {
    const role = await this.repository.findRoleById(id);
    if (!role) throw new BizException(ErrorCode.ADMIN_ROLE_NOT_FOUND);
    const updated = await this.repository.updateRole(id, dto);
    if (!updated) throw new BizException(ErrorCode.ADMIN_ROLE_NOT_FOUND);
    // disabled 变更影响权限解析
    if (dto.disabled !== undefined && dto.disabled !== role.disabled) {
      await this.invalidatePermCache();
    }
    return updated;
  }

  async deleteRole(id: string): Promise<{ id: string }> {
    const role = await this.repository.findRoleById(id);
    if (!role) throw new BizException(ErrorCode.ADMIN_ROLE_NOT_FOUND);
    if (role.builtin) throw new BizException(ErrorCode.ADMIN_ROLE_BUILTIN_LOCKED);
    if ((await this.repository.countRoleBindings(id)) > 0) {
      throw new BizException(ErrorCode.ADMIN_ROLE_IN_USE, '角色仍被用户绑定，先解绑后再删除');
    }
    await this.repository.deleteRole(id);
    await this.invalidatePermCache();
    return { id };
  }

  // ── 权限点 ──────────────────────────────────────────────────

  async listPermissions(resource?: string): Promise<PermissionEntity[]> {
    return this.repository.listPermissions(resource);
  }

  async createPermission(dto: CreatePermissionDto): Promise<PermissionEntity> {
    if (await this.repository.findPermissionByCode(dto.code)) {
      throw new BizException(ErrorCode.ADMIN_PERMISSION_CODE_CONFLICT);
    }
    const permission = await this.repository.createPermission({
      code: dto.code,
      name: dto.name,
      resource: dto.resource,
      action: dto.action,
      type: dto.type ?? 'api',
      description: dto.description,
      sort: dto.sort ?? 0,
    });
    await this.invalidatePermCache();
    return permission;
  }

  // ── 角色授权 ────────────────────────────────────────────────

  /** 角色当前授权权限码（授权面板回显） */
  async listRolePermissionCodes(roleId: string): Promise<string[]> {
    await this.requireRole(roleId);
    return this.repository.listRolePermissionCodes(roleId);
  }

  /** 全量替换角色授权：未知权限码 → 40001；超管角色的授权变更不影响通配语义 */
  async grantRolePermissions(roleId: string, dto: GrantPermissionsDto): Promise<{ granted: number }> {
    await this.requireRole(roleId);
    const permissions = await this.repository.findPermissionsByCodes(dto.permissionCodes);
    const found = new Set(permissions.map((p) => p.code));
    const missing = dto.permissionCodes.filter((c) => !found.has(c));
    if (missing.length > 0) {
      throw new BizException(ErrorCode.NOT_FOUND, '存在未知权限码', { missingPermissionCodes: missing });
    }
    await this.repository.replaceRolePermissions(roleId, permissions.map((p) => p.id));
    await this.invalidatePermCache();
    return { granted: permissions.length };
  }

  // ── 用户角色绑定 ────────────────────────────────────────────

  async listUserRoles(userId: string): Promise<RoleEntity[]> {
    if (!(await this.repository.userExists(userId))) {
      throw new BizException(ErrorCode.ADMIN_BIND_USER_NOT_FOUND);
    }
    return this.repository.listRolesByUserId(userId);
  }

  /** 全量替换用户角色绑定：未知角色码 → 40001；变更即时影响 @RequirePerm 解析 */
  async bindUserRoles(userId: string, dto: BindUserRolesDto): Promise<{ bound: number }> {
    if (!(await this.repository.userExists(userId))) {
      throw new BizException(ErrorCode.ADMIN_BIND_USER_NOT_FOUND);
    }
    const roles = await this.repository.listRoles();
    const byCode = new Map(roles.map((r) => [r.code, r] as const));
    const missing = dto.roleCodes.filter((c) => !byCode.has(c));
    if (missing.length > 0) {
      throw new BizException(ErrorCode.NOT_FOUND, '存在未知角色码', { missingRoleCodes: missing });
    }
    await this.repository.replaceUserRoles(
      userId,
      dto.roleCodes.map((c) => byCode.get(c)?.id ?? ''),
    );
    await this.invalidatePermCache();
    return { bound: dto.roleCodes.length };
  }

  // ── 实时权限解析 ────────────────────────────────────────────

  /**
   * 解析用户当前权限码全集（通配哨兵 PERM_WILDCARD 代表超管）。
   * 结果缓存 30s + 版本号失效；解析来源 = 绑定角色 ∪ JWT 快照中存在且启用的角色。
   */
  async resolvePermissionCodes(actor: AuthUser): Promise<Set<string>> {
    const ver = (await this.cache.get<number>(PERM_CACHE_VERSION_KEY)) ?? 1;
    const key = `admin:perm:v${ver}:${actor.id}`;
    const cached = await this.cache.get<string[]>(key);
    if (cached) return new Set(cached);

    const codes = await this.loadPermissionCodes(actor);
    await this.cache.set(key, [...codes], PERM_CACHE_TTL_MS);
    return codes;
  }

  /** 端点权限校验：超管通配；未命中抛 20003 并携带 requiredPermission */
  async requirePermission(actor: AuthUser, code: string): Promise<void> {
    const perms = await this.resolvePermissionCodes(actor);
    if (perms.has(PERM_WILDCARD) || perms.has(code)) return;
    throw new BizException(ErrorCode.FORBIDDEN, '无访问权限', { requiredPermission: code });
  }

  /** 用户绑定的角色（含禁用；展示真实绑定关系） */
  private async loadPermissionCodes(actor: AuthUser): Promise<Set<string>> {
    const boundCodes = await this.repository.findEnabledRoleCodesByUserId(actor.id);
    const jwtCodes = await this.repository.findEnabledRoleCodesByCodes(actor.roles);
    const roleCodes = [...new Set([...boundCodes, ...jwtCodes])];
    if (roleCodes.includes(this.superRole)) return new Set([PERM_WILDCARD]);
    const codes = await this.repository.findPermissionCodesByRoleCodes(roleCodes);
    return new Set(codes);
  }

  private async requireRole(roleId: string): Promise<RoleEntity> {
    const role = await this.repository.findRoleById(roleId);
    if (!role) throw new BizException(ErrorCode.ADMIN_ROLE_NOT_FOUND);
    return role;
  }

  /** 版本号递增：全部用户权限缓存批量失效（写路径统一出口） */
  private async invalidatePermCache(): Promise<void> {
    const ver = (await this.cache.get<number>(PERM_CACHE_VERSION_KEY)) ?? 1;
    await this.cache.set(PERM_CACHE_VERSION_KEY, ver + 1, PERM_CACHE_VERSION_TTL_MS);
  }
}
