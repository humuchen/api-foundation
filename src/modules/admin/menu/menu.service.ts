import { Cache } from '@nestjs/cache-manager';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../../../contracts/index.js';
import { ErrorCode } from '../../../common/error-codes.js';
import { BizException } from '../../../common/exceptions/biz.exception.js';
import { PERM_WILDCARD, RbacService } from '../rbac/rbac.service.js';
import { CreateMenuDto, UpdateMenuDto } from './menu.dto.js';
import type { MenuEntity, MenuNode } from './menu.repository.js';
import { MenuRepository } from './menu.repository.js';

/** 全量菜单树缓存：版本号递增批量失效（版本键与数据键分离） */
const MENU_VERSION_KEY = 'admin:menu:ver';
const MENU_CACHE_TTL_MS = 60_000;
const MENU_VERSION_TTL_MS = 86_400_000;

/**
 * 菜单服务：树组装、按权限过滤、路由元信息下发。
 *
 * 前端动态路由约定（docs/admin-module.md 详述）：
 *  - GET /admin/menus/my 返回当前用户可见树（visible=true 且 permCode 命中权限集合）；
 *  - 节点 path/component/meta 即路由声明：meta.title → 导航标题，meta.layout/theme →
 *    布局与主题覆写，实现「响应式布局与多主题」的页面级微调；
 *  - 全量树缓存 + 写失效；按用户过滤为内存操作（菜单量级有限）。
 */
@Injectable()
export class MenuService {
  constructor(
    private readonly repository: MenuRepository,
    private readonly rbacService: RbacService,
    private readonly cache: Cache,
  ) {}

  /** 全量树（管理端维护视图，admin:menu:list） */
  async listTree(): Promise<MenuNode[]> {
    const ver = (await this.cache.get<number>(MENU_VERSION_KEY)) ?? 1;
    const cacheKey = `admin:menu:tree:v${ver}`;
    const cached = await this.cache.get<MenuNode[]>(cacheKey);
    if (cached) return cached;
    const entities = await this.repository.findAll();
    const tree = this.buildTree(entities);
    await this.cache.set(cacheKey, tree, MENU_CACHE_TTL_MS);
    return tree;
  }

  /** 当前用户可见树（动态路由数据源）：visible 且 permCode 命中（超管通配） */
  async visibleTreeFor(actor: AuthUser): Promise<MenuNode[]> {
    const [tree, perms] = await Promise.all([
      this.listTree(),
      this.rbacService.resolvePermissionCodes(actor),
    ]);
    if (perms.has(PERM_WILDCARD)) return tree;
    return this.filterByPerms(tree, perms);
  }

  async createMenu(dto: CreateMenuDto): Promise<MenuEntity> {
    await this.validateParent(dto.parentId ?? null);
    if (await this.repository.findByPath(dto.path)) {
      throw new BizException(ErrorCode.ADMIN_MENU_PATH_CONFLICT);
    }
    try {
      const menu = await this.repository.create({
        parentId: dto.parentId ?? null,
        name: dto.name,
        path: dto.path,
        component: dto.component ?? null,
        icon: dto.icon ?? null,
        sort: dto.sort ?? 0,
        type: dto.type ?? 'menu',
        permCode: dto.permCode ?? null,
        visible: dto.visible ?? true,
        builtin: false,
        metaJson: dto.meta === undefined ? null : JSON.stringify(dto.meta),
      });
      await this.invalidateTreeCache();
      return menu;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BizException(ErrorCode.ADMIN_MENU_PATH_CONFLICT);
      }
      throw e;
    }
  }

  async updateMenu(id: string, dto: UpdateMenuDto): Promise<MenuEntity> {
    const menu = await this.repository.findById(id);
    if (!menu) throw new BizException(ErrorCode.ADMIN_MENU_NOT_FOUND);

    const patch: {
      parentId?: string | null;
      name?: string;
      path?: string;
      component?: string | null;
      icon?: string | null;
      sort?: number;
      type?: string;
      permCode?: string | null;
      visible?: boolean;
      metaJson?: string | null;
    } = {};
    if (dto.parentId !== undefined) {
      await this.validateParent(dto.parentId, id);
      patch.parentId = dto.parentId;
    }
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.path !== undefined && dto.path !== menu.path) {
      if (await this.repository.findByPath(dto.path)) {
        throw new BizException(ErrorCode.ADMIN_MENU_PATH_CONFLICT);
      }
      patch.path = dto.path;
    }
    if (dto.component !== undefined) patch.component = dto.component;
    if (dto.icon !== undefined) patch.icon = dto.icon;
    if (dto.sort !== undefined) patch.sort = dto.sort;
    if (dto.type !== undefined) {
      // 目录被降级为页面时若仍有子级则拒绝（树结构不被破坏）
      if (menu.type === 'directory' && dto.type === 'menu') {
        if (await this.repository.hasChildren(id)) {
          throw new BizException(ErrorCode.ADMIN_MENU_HAS_CHILDREN, '目录含子级，禁止降级为页面');
        }
      }
      patch.type = dto.type;
    }
    if (dto.permCode !== undefined) patch.permCode = dto.permCode;
    if (dto.visible !== undefined) patch.visible = dto.visible;
    if (dto.meta !== undefined) patch.metaJson = JSON.stringify(dto.meta);

    const updated = await this.repository.update(id, patch);
    if (!updated) throw new BizException(ErrorCode.ADMIN_MENU_NOT_FOUND);
    await this.invalidateTreeCache();
    return updated;
  }

  async deleteMenu(id: string): Promise<{ id: string }> {
    const menu = await this.repository.findById(id);
    if (!menu) throw new BizException(ErrorCode.ADMIN_MENU_NOT_FOUND);
    if (menu.builtin) throw new BizException(ErrorCode.ADMIN_MENU_BUILTIN_LOCKED);
    if (await this.repository.hasChildren(id)) {
      throw new BizException(ErrorCode.ADMIN_MENU_HAS_CHILDREN);
    }
    await this.repository.remove(id);
    await this.invalidateTreeCache();
    return { id };
  }

  // ── 内部 ────────────────────────────────────────────────────

  private buildTree(entities: MenuEntity[]): MenuNode[] {
    const byId = new Map<string, MenuNode>(entities.map((e) => [e.id, { ...e, children: [] }]));
    const roots: MenuNode[] = [];
    for (const node of byId.values()) {
      const parent = node.parentId ? byId.get(node.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  private filterByPerms(nodes: MenuNode[], perms: Set<string>): MenuNode[] {
    const result: MenuNode[] = [];
    for (const node of nodes) {
      const children = this.filterByPerms(node.children, perms);
      const visible = node.visible && (!node.permCode || perms.has(node.permCode));
      // 父级无权可见但子级有权可见时仍保留目录（children 已过滤）
      if (visible || children.length > 0) {
        result.push(visible ? { ...node, children } : { ...node, children, visible: false });
      }
    }
    return result;
  }

  /** 父级合法性：存在、类型为 directory、不形成环（沿父链回溯不含自身） */
  private async validateParent(parentId: string | null, selfId?: string): Promise<void> {
    if (parentId === null) return;
    let current = await this.repository.findById(parentId);
    if (!current || current.type !== 'directory') {
      throw new BizException(ErrorCode.ADMIN_MENU_PARENT_INVALID, '父级菜单不存在或类型不为目录');
    }
    if (selfId) {
      while (current) {
        if (current.id === selfId) {
          throw new BizException(ErrorCode.ADMIN_MENU_PARENT_INVALID, '父级不能是自身或其子孙');
        }
        current = current.parentId ? await this.repository.findById(current.parentId) : null;
      }
    }
  }

  private async invalidateTreeCache(): Promise<void> {
    const ver = (await this.cache.get<number>(MENU_VERSION_KEY)) ?? 1;
    await this.cache.set(MENU_VERSION_KEY, ver + 1, MENU_VERSION_TTL_MS);
  }
}
