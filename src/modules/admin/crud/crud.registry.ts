import { Injectable } from '@nestjs/common';
import { ErrorCode } from '../../../common/error-codes.js';
import { BizException } from '../../../common/exceptions/biz.exception.js';
import type { CrudEntityDefinition, CrudResourceSummary } from '../admin.contracts.js';

/** 资源标识约定：小写字母开头，字母数字中划线（即 URL 路由段） */
export const CRUD_RESOURCE_PATTERN = /^[a-z][a-z0-9-]*$/;

/** Prisma model 命名（delegate 属性，camelCase） */
export const CRUD_MODEL_PATTERN = /^[a-zA-Z][a-zA-Z0-9]*$/;

/** 字段 key 命名：与 Prisma model 属性一致（camelCase） */
export const CRUD_FIELD_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;

/**
 * CRUD 实体注册表：通用 CRUD 引擎的插件入口。
 * 业务实体定义经 AdminModule.forRoot({ crudEntities })（配置式）或
 * CrudRegistry.register()（运行时，业务模块 onModuleInit）注册；
 * 注册期完成结构校验（fail-fast：非法定义启动即报错而非请求期 500）。
 */
@Injectable()
export class CrudRegistry {
  private readonly entities = new Map<string, CrudEntityDefinition>();

  /** 注册实体定义：同 resource 重复注册抛冲突（覆盖式注册须先 unregister，防误覆盖） */
  register(definition: CrudEntityDefinition): void {
    const { resource, model, fields } = definition;

    if (!CRUD_RESOURCE_PATTERN.test(resource)) {
      throw new BizException(ErrorCode.ADMIN_CRUD_FIELD_INVALID, `非法 resource：${resource}`, {
        details: [{ field: 'resource', message: '须为小写字母开头的字母/数字/中划线' }],
      });
    }
    if (!CRUD_MODEL_PATTERN.test(model)) {
      throw new BizException(ErrorCode.ADMIN_CRUD_FIELD_INVALID, `非法 model：${model}`, {
        details: [{ field: 'model', message: '须为 Prisma model 属性名（camelCase）' }],
      });
    }
    if (this.entities.has(resource)) {
      throw new BizException(ErrorCode.ADMIN_CRUD_FIELD_INVALID, `资源重复注册：${resource}`, {
        details: [{ field: 'resource', message: '已存在同名资源定义' }],
      });
    }
    if (!Array.isArray(fields) || fields.length === 0) {
      throw new BizException(ErrorCode.ADMIN_CRUD_FIELD_INVALID, `资源 ${resource} 缺少字段定义`, {
        details: [{ field: 'fields', message: '至少声明一个字段' }],
      });
    }

    const seen = new Set<string>();
    for (const field of fields) {
      if (!CRUD_FIELD_PATTERN.test(field.key)) {
        throw new BizException(ErrorCode.ADMIN_CRUD_FIELD_INVALID, `资源 ${resource} 非法字段 key：${field.key}`, {
          details: [{ field: field.key, message: '须为字母开头的字母/数字/下划线' }],
        });
      }
      if (seen.has(field.key)) {
        throw new BizException(ErrorCode.ADMIN_CRUD_FIELD_INVALID, `资源 ${resource} 字段重复：${field.key}`, {
          details: [{ field: field.key, message: '字段 key 重复' }],
        });
      }
      seen.add(field.key);
    }

    this.entities.set(resource, definition);
  }

  unregister(resource: string): boolean {
    return this.entities.delete(resource);
  }

  /** 取定义：未注册 → 33401（运行期资源不存在语义） */
  get(resource: string): CrudEntityDefinition {
    const found = this.entities.get(resource);
    if (!found) throw new BizException(ErrorCode.ADMIN_CRUD_RESOURCE_NOT_FOUND, `CRUD 资源未注册：${resource}`);
    return found;
  }

  has(resource: string): boolean {
    return this.entities.has(resource);
  }

  /** 已注册资源摘要（GET /admin/crud/_registry；前端动态工作台/菜单生成） */
  summary(): CrudResourceSummary[] {
    return [...this.entities.values()].map((def) => ({
      resource: def.resource,
      model: def.model,
      title: def.title,
      description: def.description ?? null,
      permissionPrefix: def.permissionPrefix ?? `crud:${def.resource}`,
      readOnly: def.readOnly ?? false,
    }));
  }

  get size(): number {
    return this.entities.size;
  }
}
