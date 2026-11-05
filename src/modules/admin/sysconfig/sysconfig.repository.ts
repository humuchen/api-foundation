import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infra/database/prisma.service.js';

/** 系统配置实体 */
export interface SysConfigEntity {
  id: string;
  key: string;
  group: string;
  value: Record<string, unknown>;
  description: string | null;
  builtin: boolean;
  createdAt: string;
  updatedAt: string;
}

type SysConfigRow = Prisma.AdminSysConfigGetPayload<Record<string, never>>;

/**
 * 系统配置仓储：admin_sys_configs 持久化访问（valueJson ↔ value 双向映射）。
 */
@Injectable()
export class SysConfigRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<SysConfigEntity[]> {
    const rows = await this.prisma.adminSysConfig.findMany({
      orderBy: [{ group: 'asc' }, { key: 'asc' }],
    });
    return rows.map((row) => this.toEntity(row));
  }

  async findByKey(key: string): Promise<SysConfigEntity | null> {
    const row = await this.prisma.adminSysConfig.findUnique({ where: { key } });
    return row ? this.toEntity(row) : null;
  }

  async create(data: {
    key: string;
    group: string;
    valueJson: string;
    description: string | null;
    builtin: boolean;
  }): Promise<SysConfigEntity> {
    const row = await this.prisma.adminSysConfig.create({ data });
    return this.toEntity(row);
  }

  async updateValue(key: string, valueJson: string): Promise<SysConfigEntity | null> {
    try {
      const row = await this.prisma.adminSysConfig.update({ where: { key }, data: { valueJson } });
      return this.toEntity(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') return null;
      throw e;
    }
  }

  async deleteByKey(key: string): Promise<boolean> {
    const result = await this.prisma.adminSysConfig.deleteMany({ where: { key } });
    return result.count > 0;
  }

  private toEntity(row: SysConfigRow): SysConfigEntity {
    let value: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(row.valueJson);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        value = parsed as Record<string, unknown>;
      }
    } catch {
      value = {};
    }
    return {
      id: row.id,
      key: row.key,
      group: row.group,
      value,
      description: row.description,
      builtin: row.builtin,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
