import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../../../contracts/index.js';
import { ErrorCode } from '../../../common/error-codes.js';
import { BizException } from '../../../common/exceptions/biz.exception.js';
import { PrismaService } from '../../../infra/database/prisma.service.js';
import { buildPage, type PageVo } from '../../../common/responses/page.vo.js';
import { toQueryOptions } from '../../../common/utils/query.util.js';
import { getRequestContext } from '../../../infra/logger/index.js';
import type { CrudEntityDefinition, CrudRequestContext, CrudResourceSummary } from '../admin.contracts.js';
import { DictService } from '../dict/dict.service.js';
import { RbacService } from '../rbac/rbac.service.js';
import { CrudRegistry } from './crud.registry.js';
import { validateCrudData } from './crud.validator.js';

/** 公共审计字段恒可排序（定义侧 sortable 之外的兜底白名单） */
const COMMON_SORTABLE = ['createdAt', 'updatedAt'];

/** Prisma delegate 的最小动态访问面（PrismaPromise 保持 $transaction 数组重载可用） */
interface CrudModelDelegate {
  findMany(args: {
    where?: Record<string, unknown>;
    orderBy?: Record<string, 'asc' | 'desc'>;
    skip?: number;
    take?: number;
  }): Prisma.PrismaPromise<Record<string, unknown>[]>;
  count(args: { where?: Record<string, unknown> }): Prisma.PrismaPromise<number>;
  findUnique(args: { where: { id: string } }): Promise<Record<string, unknown> | null>;
  create(args: { data: Record<string, unknown> }): Promise<Record<string, unknown>>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<Record<string, unknown>>;
  deleteMany(args: { where: { id: string } }): Promise<{ count: number }>;
}

/**
 * 通用 CRUD 引擎（元数据驱动）：一个 CrudEntityDefinition 即一个插件化的数据管理面。
 *
 * 职责链：注册表取定义 → 动态权限校验（<permissionPrefix>:<action>）→ 定义驱动校验
 * （同步校验器 + 字典值异步校验）→ hooks 业务钩子 → Prisma delegate 动态读写。
 * 前端表格/表单零硬编码：GET /admin/crud/:resource/schema 原样下发定义。
 */
@Injectable()
export class CrudService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: CrudRegistry,
    private readonly dictService: DictService,
    private readonly rbacService: RbacService,
  ) {}

  /** 已注册资源摘要（_registry 端点） */
  listResources(): CrudResourceSummary[] {
    return this.registry.summary();
  }

  /** 实体定义原样下发（schema 端点；表格列 + 表单项的单一事实来源） */
  getSchema(resource: string): CrudEntityDefinition {
    return this.registry.get(resource);
  }

  // ── 查询 ────────────────────────────────────────────────────

  /**
   * 分页查询：过滤字段白名单 = inFilter 字段（string → contains 模糊，其余等值），
   * keyword 在全部 string inFilter 字段上 OR contains；排序白名单 = sortable 字段 + 公共字段。
   */
  async page(
    resource: string,
    query: { page: number; pageSize: number; sort?: string },
    filters: Record<string, unknown>,
    actor: AuthUser,
  ): Promise<PageVo<Record<string, unknown>>> {
    const def = this.registry.get(resource);
    await this.requirePermission(actor, def, 'list');

    const where = this.buildWhere(def, filters);
    const opts = toQueryOptions(query, this.sortableFields(def));
    const delegate = this.delegateOf(def);

    const [rows, total] = await this.prisma.$transaction([
      delegate.findMany({
        where,
        orderBy: this.orderBy(opts.order, def),
        skip: opts.skip,
        take: opts.take,
      }),
      delegate.count({ where }),
    ]);
    return buildPage(rows, total, opts.page, opts.pageSize);
  }

  async detail(resource: string, id: string, actor: AuthUser): Promise<Record<string, unknown>> {
    const def = this.registry.get(resource);
    await this.requirePermission(actor, def, 'list');
    const row = await this.delegateOf(def).findUnique({ where: { id } });
    if (!row) throw new BizException(ErrorCode.NOT_FOUND, `${def.title}不存在`);
    return row;
  }

  // ── 写路径 ──────────────────────────────────────────────────

  async create(
    resource: string,
    input: Record<string, unknown>,
    actor: AuthUser,
  ): Promise<Record<string, unknown>> {
    const def = this.registry.get(resource);
    this.requireWrite(def);
    await this.requirePermission(actor, def, 'create');

    const { data, violations, dictChecks } = validateCrudData(def, input, 'create');
    await this.assertValid(def, violations, dictChecks, input);

    const ctx = this.requestContext(actor);
    const finalData = def.hooks?.beforeCreate ? await def.hooks.beforeCreate(data, ctx) : data;
    let row: Record<string, unknown>;
    try {
      row = await this.delegateOf(def).create({ data: finalData });
    } catch (e) {
      throw this.mapPrismaError(e, def);
    }
    if (def.hooks?.afterCreate) await def.hooks.afterCreate(row, ctx);
    return row;
  }

  async update(
    resource: string,
    id: string,
    input: Record<string, unknown>,
    actor: AuthUser,
  ): Promise<Record<string, unknown>> {
    const def = this.registry.get(resource);
    this.requireWrite(def);
    await this.requirePermission(actor, def, 'update');

    const { data, violations, dictChecks } = validateCrudData(def, input, 'update');
    await this.assertValid(def, violations, dictChecks, input);

    const ctx = this.requestContext(actor);
    const finalData = def.hooks?.beforeUpdate ? await def.hooks.beforeUpdate(id, data, ctx) : data;
    let row: Record<string, unknown>;
    try {
      row = await this.delegateOf(def).update({ where: { id }, data: finalData });
    } catch (e) {
      throw this.mapPrismaError(e, def);
    }
    if (def.hooks?.afterUpdate) await def.hooks.afterUpdate(row, ctx);
    return row;
  }

  async remove(resource: string, id: string, actor: AuthUser): Promise<{ id: string }> {
    const def = this.registry.get(resource);
    this.requireWrite(def);
    await this.requirePermission(actor, def, 'delete');

    const ctx = this.requestContext(actor);
    if (def.hooks?.beforeDelete) await def.hooks.beforeDelete(id, ctx);
    const result = await this.delegateOf(def).deleteMany({ where: { id } });
    if (result.count === 0) throw new BizException(ErrorCode.NOT_FOUND, `${def.title}不存在`);
    return { id };
  }

  // ── 内部 ────────────────────────────────────────────────────

  /** 过滤条件组装：inFilter 白名单 + keyword 模糊 OR；畸形入参静默忽略（防探测） */
  private buildWhere(def: CrudEntityDefinition, filters: Record<string, unknown>): Record<string, unknown> {
    const where: Record<string, unknown> = { ...(def.baseWhere ?? {}) };
    const and: Array<Record<string, unknown>> = [];

    for (const field of def.fields) {
      if (!field.inFilter) continue;
      const raw = filters[field.key];
      if (raw === undefined || raw === null || raw === '') continue;
      if (Array.isArray(raw) || typeof raw === 'object') continue;

      if (field.type === 'string' || field.type === 'text') {
        and.push({ [field.key]: { contains: String(raw) } });
      } else if (field.type === 'number' || field.type === 'integer') {
        const num = Number(raw);
        if (!Number.isNaN(num)) and.push({ [field.key]: num });
      } else if (field.type === 'boolean') {
        if (raw === 'true' || raw === true) and.push({ [field.key]: true });
        else if (raw === 'false' || raw === false) and.push({ [field.key]: false });
      } else {
        // enum/dict/date/datetime/json：等值
        and.push({ [field.key]: raw });
      }
    }

    // keyword：全部 string inFilter 字段 OR contains
    const keyword = filters['keyword'];
    if (typeof keyword === 'string' && keyword.trim() !== '') {
      const textFields = def.fields
        .filter((f) => f.inFilter && (f.type === 'string' || f.type === 'text'))
        .map((f) => ({ [f.key]: { contains: keyword.trim() } }));
      if (textFields.length > 0) and.push({ OR: textFields });
    }

    if (and.length > 0) where.AND = and;
    return where;
  }

  private sortableFields(def: CrudEntityDefinition): string[] {
    const fields = def.fields.filter((f) => f.sortable).map((f) => f.key);
    return [...new Set([...fields, ...COMMON_SORTABLE])];
  }

  private orderBy(order: Record<string, 'ASC' | 'DESC'>, def: CrudEntityDefinition): Record<string, 'asc' | 'desc'> {
    const [field, dir] = Object.entries(order)[0] ?? [def.defaultSort ?? 'createdAt', 'DESC'];
    return { [field]: dir.toLowerCase() as 'asc' | 'desc' };
  }

  private async requirePermission(
    actor: AuthUser,
    def: CrudEntityDefinition,
    action: 'list' | 'create' | 'update' | 'delete',
  ): Promise<void> {
    const prefix = def.permissionPrefix ?? `crud:${def.resource}`;
    await this.rbacService.requirePermission(actor, `${prefix}:${action}`);
  }

  private requireWrite(def: CrudEntityDefinition): void {
    if (def.readOnly) throw new BizException(ErrorCode.ADMIN_CRUD_RESOURCE_READONLY, `${def.title} 为只读资源`);
  }

  /** 同步校验失败 + 字典值异步校验的统一出口（明细结构与全局 ValidationPipe 对齐） */
  private async assertValid(
    def: CrudEntityDefinition,
    violations: Array<{ field: string; message: string }>,
    dictChecks: Array<{ field: string; dictType: string }>,
    input: Record<string, unknown>,
  ): Promise<void> {
    for (const check of dictChecks) {
      await this.dictService.validateItemValue(check.dictType, input[check.field], check.field);
    }
    if (violations.length > 0) {
      throw new BizException(ErrorCode.ADMIN_CRUD_FIELD_INVALID, `${def.title} 字段校验失败`, {
        details: violations,
      });
    }
  }

  private requestContext(actor: AuthUser): CrudRequestContext {
    return {
      actor: { id: actor.id, username: actor.username, roles: actor.roles },
      tenantId: getRequestContext()?.tenantId ?? null,
    };
  }

  private delegateOf(def: CrudEntityDefinition): CrudModelDelegate {
    const table = (this.prisma as unknown as Record<string, CrudModelDelegate | undefined>)[def.model];
    if (!table) {
      throw new BizException(ErrorCode.ADMIN_CRUD_MODEL_MISSING, `数据模型缺失：${def.model}`);
    }
    return table;
  }

  private mapPrismaError(e: unknown, def: CrudEntityDefinition): Error {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2025') return new BizException(ErrorCode.NOT_FOUND, `${def.title}不存在`);
      if (e.code === 'P2002') return new BizException(ErrorCode.CONFLICT, `${def.title}唯一性冲突`);
    }
    return e instanceof Error ? e : new Error(String(e));
  }
}
