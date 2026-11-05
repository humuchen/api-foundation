import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infra/database/prisma.service.js';

/** 菜单实体（应用层形态；metaJson 反序列化为 meta 对象） */
export interface MenuEntity {
  id: string;
  parentId: string | null;
  name: string;
  path: string;
  component: string | null;
  icon: string | null;
  sort: number;
  /** directory=目录 menu=页面 */
  type: string;
  /** 可见性权限码：null=登录即可见 */
  permCode: string | null;
  visible: boolean;
  builtin: boolean;
  /** 路由元信息（title/keepAlive/layout/theme 约定见 docs/admin-module.md） */
  meta: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

/** 树节点：实体 + 子级（前端动态路由数据源） */
export interface MenuNode extends MenuEntity {
  children: MenuNode[];
}

type MenuRow = Prisma.AdminMenuGetPayload<Record<string, never>>;

/**
 * 菜单仓储：admin_menus 持久化访问（自引用树，无 relation，树组装在服务层完成）。
 */
@Injectable()
export class MenuRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 全量菜单（sort/createdAt 升序；菜单量级有限，一次载入内存组树） */
  async findAll(): Promise<MenuEntity[]> {
    const rows = await this.prisma.adminMenu.findMany({
      orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((row) => this.toEntity(row));
  }

  async findById(id: string): Promise<MenuEntity | null> {
    const row = await this.prisma.adminMenu.findUnique({ where: { id } });
    return row ? this.toEntity(row) : null;
  }

  async findByPath(path: string): Promise<MenuEntity | null> {
    const row = await this.prisma.adminMenu.findUnique({ where: { path } });
    return row ? this.toEntity(row) : null;
  }

  async create(data: {
    parentId: string | null;
    name: string;
    path: string;
    component: string | null;
    icon: string | null;
    sort: number;
    type: string;
    permCode: string | null;
    visible: boolean;
    builtin: boolean;
    metaJson: string | null;
  }): Promise<MenuEntity> {
    const row = await this.prisma.adminMenu.create({ data });
    return this.toEntity(row);
  }

  async update(
    id: string,
    patch: {
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
    },
  ): Promise<MenuEntity | null> {
    const data: Prisma.AdminMenuUpdateInput = {};
    if (patch.parentId !== undefined) data.parentId = patch.parentId;
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.path !== undefined) data.path = patch.path;
    if (patch.component !== undefined) data.component = patch.component;
    if (patch.icon !== undefined) data.icon = patch.icon;
    if (patch.sort !== undefined) data.sort = patch.sort;
    if (patch.type !== undefined) data.type = patch.type;
    if (patch.permCode !== undefined) data.permCode = patch.permCode;
    if (patch.visible !== undefined) data.visible = patch.visible;
    if (patch.metaJson !== undefined) data.metaJson = patch.metaJson;
    try {
      const row = await this.prisma.adminMenu.update({ where: { id }, data });
      return this.toEntity(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') return null;
      throw e;
    }
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.prisma.adminMenu.deleteMany({ where: { id } });
    return result.count > 0;
  }

  /** 是否存在子级（删除前置校验） */
  async hasChildren(id: string): Promise<boolean> {
    return (await this.prisma.adminMenu.count({ where: { parentId: id } })) > 0;
  }

  private toEntity(row: MenuRow): MenuEntity {
    let meta: Record<string, unknown> | null = null;
    if (row.metaJson) {
      try {
        const parsed: unknown = JSON.parse(row.metaJson);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          meta = parsed as Record<string, unknown>;
        }
      } catch {
        meta = null;
      }
    }
    return {
      id: row.id,
      parentId: row.parentId,
      name: row.name,
      path: row.path,
      component: row.component,
      icon: row.icon,
      sort: row.sort,
      type: row.type,
      permCode: row.permCode,
      visible: row.visible,
      builtin: row.builtin,
      meta,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
