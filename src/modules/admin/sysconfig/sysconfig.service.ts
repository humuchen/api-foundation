import { Cache } from '@nestjs/cache-manager';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCode } from '../../../common/error-codes.js';
import { BizException } from '../../../common/exceptions/biz.exception.js';
import { CreateSysConfigDto, UpdateSysConfigDto } from './sysconfig.dto.js';
import type { SysConfigEntity } from './sysconfig.repository.js';
import { SysConfigRepository } from './sysconfig.repository.js';

/** 配置缓存：版本号递增批量失效 */
const CONFIG_VERSION_KEY = 'admin:config:ver';
const CONFIG_CACHE_TTL_MS = 60_000;
const CONFIG_VERSION_TTL_MS = 86_400_000;

/**
 * 系统配置服务：键值/分组管理 + ui 组下发（多主题与响应式布局的配置约定承载者）。
 *
 * 配置约定（docs/admin-module.md 详述）：
 *  - key 为点分命名「组.键」；group 分组检索；
 *  - ui.theme：主色/暗色模式/圆角/紧凑 —— 前端映射为 CSS 变量实现多主题；
 *  - ui.layout：布局模式/侧栏折叠/响应式断点 —— 前端据此切换布局与断点行为。
 */
@Injectable()
export class SysConfigService {
  constructor(private readonly repository: SysConfigRepository, private readonly cache: Cache) {}

  /** 全量配置（管理端，admin:config:list） */
  async listAll(): Promise<SysConfigEntity[]> {
    const ver = (await this.cache.get<number>(CONFIG_VERSION_KEY)) ?? 1;
    const key = `admin:config:all:v${ver}`;
    const cached = await this.cache.get<SysConfigEntity[]>(key);
    if (cached) return cached;
    const all = await this.repository.findAll();
    await this.cache.set(key, all, CONFIG_CACHE_TTL_MS);
    return all;
  }

  /** 按组读取（登录即可读：ui 组供前端启动时拉取主题/布局） */
  async listByGroup(group: string): Promise<SysConfigEntity[]> {
    const all = await this.listAll();
    return all.filter((c) => c.group === group);
  }

  /** 单键读取（内部消费：bootstrap 聚合 ui 组） */
  async getValue(key: string): Promise<Record<string, unknown> | null> {
    const all = await this.listAll();
    const found = all.find((c) => c.key === key);
    return found ? found.value : null;
  }

  async create(dto: CreateSysConfigDto): Promise<SysConfigEntity> {
    if (await this.repository.findByKey(dto.key)) {
      throw new BizException(ErrorCode.ADMIN_CONFIG_KEY_CONFLICT);
    }
    try {
      const config = await this.repository.create({
        key: dto.key,
        group: dto.group,
        valueJson: JSON.stringify(dto.value),
        description: dto.description ?? null,
        builtin: false,
      });
      await this.invalidateConfigCache();
      return config;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BizException(ErrorCode.ADMIN_CONFIG_KEY_CONFLICT);
      }
      throw e;
    }
  }

  async update(key: string, dto: UpdateSysConfigDto): Promise<SysConfigEntity> {
    const updated = await this.repository.updateValue(key, JSON.stringify(dto.value));
    if (!updated) throw new BizException(ErrorCode.ADMIN_CONFIG_NOT_FOUND);
    await this.invalidateConfigCache();
    return updated;
  }

  async delete(key: string): Promise<{ key: string }> {
    const found = await this.repository.findByKey(key);
    if (!found) throw new BizException(ErrorCode.ADMIN_CONFIG_NOT_FOUND);
    if (found.builtin) throw new BizException(ErrorCode.ADMIN_CONFIG_BUILTIN_LOCKED);
    await this.repository.deleteByKey(key);
    await this.invalidateConfigCache();
    return { key };
  }

  private async invalidateConfigCache(): Promise<void> {
    const ver = (await this.cache.get<number>(CONFIG_VERSION_KEY)) ?? 1;
    await this.cache.set(CONFIG_VERSION_KEY, ver + 1, CONFIG_VERSION_TTL_MS);
  }
}
