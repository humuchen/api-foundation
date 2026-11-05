import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infra/database/prisma.service.js';

/** 字典类型实体 */
export interface DictTypeEntity {
  id: string;
  code: string;
  name: string;
  description: string | null;
  builtin: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 字典项实体 */
export interface DictItemEntity {
  id: string;
  typeCode: string;
  label: string;
  value: string;
  sort: number;
  extra: Record<string, unknown> | null;
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
}

type DictTypeRow = Prisma.AdminDictTypeGetPayload<Record<string, never>>;
type DictItemRow = Prisma.AdminDictItemGetPayload<Record<string, never>>;

/**
 * 字典仓储：admin_dict_types / admin_dict_items 持久化访问。
 * 项以 typeCode 冗余引用（免 join）；类型内 (typeCode, value) 复合唯一。
 */
@Injectable()
export class DictRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── 类型 ────────────────────────────────────────────────────

  async listTypes(): Promise<DictTypeEntity[]> {
    const rows = await this.prisma.adminDictType.findMany({ orderBy: { createdAt: 'asc' } });
    return rows.map((row) => this.toTypeEntity(row));
  }

  async findTypeByCode(code: string): Promise<DictTypeEntity | null> {
    const row = await this.prisma.adminDictType.findUnique({ where: { code } });
    return row ? this.toTypeEntity(row) : null;
  }

  async findTypeById(id: string): Promise<DictTypeEntity | null> {
    const row = await this.prisma.adminDictType.findUnique({ where: { id } });
    return row ? this.toTypeEntity(row) : null;
  }

  async createType(data: {
    code: string;
    name: string;
    description: string | null;
    builtin: boolean;
  }): Promise<DictTypeEntity> {
    const row = await this.prisma.adminDictType.create({ data });
    return this.toTypeEntity(row);
  }

  async updateType(
    id: string,
    patch: { name?: string; description?: string | null },
  ): Promise<DictTypeEntity | null> {
    const data: Prisma.AdminDictTypeUpdateInput = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.description !== undefined) data.description = patch.description;
    try {
      const row = await this.prisma.adminDictType.update({ where: { id }, data });
      return this.toTypeEntity(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') return null;
      throw e;
    }
  }

  /** 删除类型与其全部项（事务内联；builtin 保护在服务层） */
  async deleteType(id: string, code: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.adminDictItem.deleteMany({ where: { typeCode: code } }),
      this.prisma.adminDictType.deleteMany({ where: { id } }),
    ]);
  }

  // ── 项 ──────────────────────────────────────────────────────

  async listItems(typeCode: string, includeDisabled: boolean): Promise<DictItemEntity[]> {
    const rows = await this.prisma.adminDictItem.findMany({
      where: { typeCode, ...(includeDisabled ? {} : { disabled: false }) },
      orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((row) => this.toItemEntity(row));
  }

  async findItemById(id: string): Promise<DictItemEntity | null> {
    const row = await this.prisma.adminDictItem.findUnique({ where: { id } });
    return row ? this.toItemEntity(row) : null;
  }

  async createItem(data: {
    typeCode: string;
    label: string;
    value: string;
    sort: number;
    disabled: boolean;
    extraJson: string | null;
  }): Promise<DictItemEntity> {
    const row = await this.prisma.adminDictItem.create({ data });
    return this.toItemEntity(row);
  }

  async updateItem(
    id: string,
    patch: { label?: string; sort?: number; disabled?: boolean; extraJson?: string | null },
  ): Promise<DictItemEntity | null> {
    const data: Prisma.AdminDictItemUpdateInput = {};
    if (patch.label !== undefined) data.label = patch.label;
    if (patch.sort !== undefined) data.sort = patch.sort;
    if (patch.disabled !== undefined) data.disabled = patch.disabled;
    if (patch.extraJson !== undefined) data.extraJson = patch.extraJson;
    try {
      const row = await this.prisma.adminDictItem.update({ where: { id }, data });
      return this.toItemEntity(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') return null;
      throw e;
    }
  }

  async deleteItem(id: string): Promise<boolean> {
    const result = await this.prisma.adminDictItem.deleteMany({ where: { id } });
    return result.count > 0;
  }

  // ── 映射 ────────────────────────────────────────────────────

  private toTypeEntity(row: DictTypeRow): DictTypeEntity {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      builtin: row.builtin,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toItemEntity(row: DictItemRow): DictItemEntity {
    let extra: Record<string, unknown> | null = null;
    if (row.extraJson) {
      try {
        const parsed: unknown = JSON.parse(row.extraJson);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          extra = parsed as Record<string, unknown>;
        }
      } catch {
        extra = null;
      }
    }
    return {
      id: row.id,
      typeCode: row.typeCode,
      label: row.label,
      value: row.value,
      sort: row.sort,
      extra,
      disabled: row.disabled,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
