import { Cache } from '@nestjs/cache-manager';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCode } from '../../../common/error-codes.js';
import { BizException } from '../../../common/exceptions/biz.exception.js';
import {
  CreateDictItemDto,
  CreateDictTypeDto,
  UpdateDictItemDto,
  UpdateDictTypeDto,
} from './dict.dto.js';
import type { DictItemEntity, DictTypeEntity } from './dict.repository.js';
import { DictRepository } from './dict.repository.js';

/** 字典缓存：版本号递增批量失效（任何类型/项写操作触发） */
const DICT_VERSION_KEY = 'admin:dict:ver';
const DICT_CACHE_TTL_MS = 60_000;
const DICT_VERSION_TTL_MS = 86_400_000;

/**
 * 字典服务：字典类型/项管理 + 按编码读取 + 运行时值校验。
 *
 * 消费方：
 *  - 前端表单：GET /admin/dicts/:code/items 拉选项渲染下拉（dict 字段类型）；
 *  - CRUD 引擎校验器：validateItemValue（写入数据前校验字典值合法性）。
 * 缓存策略与 user/menu 模块一致（版本号递增批量失效）。
 */
@Injectable()
export class DictService {
  constructor(private readonly repository: DictRepository, private readonly cache: Cache) {}

  // ── 类型管理 ────────────────────────────────────────────────

  async listTypes(): Promise<DictTypeEntity[]> {
    return this.repository.listTypes();
  }

  async createType(dto: CreateDictTypeDto): Promise<DictTypeEntity> {
    if (await this.repository.findTypeByCode(dto.code)) {
      throw new BizException(ErrorCode.ADMIN_DICT_TYPE_CODE_CONFLICT);
    }
    const type = await this.repository.createType({
      code: dto.code,
      name: dto.name,
      description: dto.description ?? null,
      builtin: false,
    });
    await this.invalidateDictCache();
    return type;
  }

  async updateType(id: string, dto: UpdateDictTypeDto): Promise<DictTypeEntity> {
    const updated = await this.repository.updateType(id, dto);
    if (!updated) throw new BizException(ErrorCode.ADMIN_DICT_TYPE_NOT_FOUND);
    await this.invalidateDictCache();
    return updated;
  }

  async deleteType(id: string): Promise<{ id: string }> {
    const type = await this.repository.findTypeById(id);
    if (!type) throw new BizException(ErrorCode.ADMIN_DICT_TYPE_NOT_FOUND);
    if (type.builtin) throw new BizException(ErrorCode.ADMIN_DICT_TYPE_BUILTIN_LOCKED);
    await this.repository.deleteType(id, type.code);
    await this.invalidateDictCache();
    return { id };
  }

  // ── 项管理 ──────────────────────────────────────────────────

  /** 字典项（?includeDisabled=true 供管理端查看停用项） */
  async listItems(typeCode: string, includeDisabled = false): Promise<DictItemEntity[]> {
    if (!(await this.repository.findTypeByCode(typeCode))) {
      throw new BizException(ErrorCode.ADMIN_DICT_TYPE_NOT_FOUND);
    }
    const ver = (await this.cache.get<number>(DICT_VERSION_KEY)) ?? 1;
    const key = `admin:dict:items:v${ver}:${typeCode}:${includeDisabled ? 'all' : 'enabled'}`;
    const cached = await this.cache.get<DictItemEntity[]>(key);
    if (cached) return cached;
    const items = await this.repository.listItems(typeCode, includeDisabled);
    await this.cache.set(key, items, DICT_CACHE_TTL_MS);
    return items;
  }

  async createItem(typeCode: string, dto: CreateDictItemDto): Promise<DictItemEntity> {
    const type = await this.repository.findTypeByCode(typeCode);
    if (!type) throw new BizException(ErrorCode.ADMIN_DICT_TYPE_NOT_FOUND);
    try {
      const item = await this.repository.createItem({
        typeCode,
        label: dto.label,
        value: dto.value,
        sort: dto.sort ?? 0,
        disabled: dto.disabled ?? false,
        extraJson: dto.extra === undefined ? null : JSON.stringify(dto.extra),
      });
      await this.invalidateDictCache();
      return item;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BizException(ErrorCode.ADMIN_DICT_VALUE_CONFLICT);
      }
      throw e;
    }
  }

  async updateItem(id: string, dto: UpdateDictItemDto): Promise<DictItemEntity> {
    const item = await this.repository.findItemById(id);
    if (!item) throw new BizException(ErrorCode.ADMIN_DICT_ITEM_NOT_FOUND);
    const updated = await this.repository.updateItem(id, {
      ...(dto.label !== undefined ? { label: dto.label } : {}),
      ...(dto.sort !== undefined ? { sort: dto.sort } : {}),
      ...(dto.disabled !== undefined ? { disabled: dto.disabled } : {}),
      ...(dto.extra !== undefined ? { extraJson: JSON.stringify(dto.extra) } : {}),
    });
    if (!updated) throw new BizException(ErrorCode.ADMIN_DICT_ITEM_NOT_FOUND);
    await this.invalidateDictCache();
    return updated;
  }

  async deleteItem(id: string): Promise<{ id: string }> {
    const ok = await this.repository.deleteItem(id);
    if (!ok) throw new BizException(ErrorCode.ADMIN_DICT_ITEM_NOT_FOUND);
    await this.invalidateDictCache();
    return { id };
  }

  // ── 运行时校验（CRUD 引擎 dict 字段类型消费） ────────────────

  /** 字典值合法性：须存在于该字典且未停用；非法抛 33402（字段校验失败语义） */
  async validateItemValue(typeCode: string, value: unknown, fieldKey: string): Promise<void> {
    if (typeof value !== 'string') {
      throw new BizException(ErrorCode.ADMIN_CRUD_FIELD_INVALID, '字段校验失败', {
        details: [{ field: fieldKey, message: `须为字典 ${typeCode} 中的合法值（字符串）` }],
      });
    }
    const items = await this.listItems(typeCode);
    if (!items.some((item) => item.value === value)) {
      throw new BizException(ErrorCode.ADMIN_CRUD_FIELD_INVALID, '字段校验失败', {
        details: [{ field: fieldKey, message: `值 ${value} 不在字典 ${typeCode} 的合法选项内` }],
      });
    }
  }

  private async invalidateDictCache(): Promise<void> {
    const ver = (await this.cache.get<number>(DICT_VERSION_KEY)) ?? 1;
    await this.cache.set(DICT_VERSION_KEY, ver + 1, DICT_VERSION_TTL_MS);
  }
}
