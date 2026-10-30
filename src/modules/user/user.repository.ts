import { Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hashSync } from 'bcryptjs';
import { PrismaService } from '../../infra/database/prisma.service';

/** 用户实体（应用层形态；与 Prisma 行记录经 toEntity 映射） */
export interface UserEntity {
  id: string;
  username: string;
  passwordHash: string;
  nickname: string;
  roles: string[];
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FindPageParams {
  skip: number;
  take: number;
  keyword?: string;
  role?: string;
  order: Record<string, 'ASC' | 'DESC'>;
}

export interface CreateParams {
  username: string;
  passwordHash: string;
  nickname: string;
  roles: string[];
}

type UserRow = Prisma.UserGetPayload<Record<string, never>>;

/**
 * 用户仓储 —— Prisma/SQLite 实现（原内存实现按同契约替换，Service/Controller 零改动）。
 * 约定：
 *  - roles 经 JSON 序列化存于 rolesJson（SQLite 无标量数组；PG 后可改 JSONB 下推过滤）；
 *  - role 过滤以 `"role"` 子串匹配 rolesJson 实现，计数与过滤同层，分页 total 保持正确。
 */
@Injectable()
export class UserRepository implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  /** 幂等种子：内置三个演示账号（已存在则不覆盖） */
  async onModuleInit(): Promise<void> {
    const now = Date.now();
    const seeds = [
      { username: 'admin', password: 'admin123', nickname: '系统管理员', roles: ['admin'], ts: now - 3000 },
      { username: 'ops', password: 'ops123456', nickname: '运维账号', roles: ['ops'], ts: now - 2000 },
      { username: 'demo', password: 'demo123456', nickname: '普通用户', roles: ['user'], ts: now - 1000 },
    ];
    await Promise.all(
      seeds.map((s) =>
        this.prisma.user.upsert({
          where: { username: s.username },
          update: {},
          create: {
            username: s.username,
            passwordHash: hashSync(s.password, 10),
            nickname: s.nickname,
            rolesJson: JSON.stringify(s.roles),
            disabled: false,
            createdAt: new Date(s.ts),
            updatedAt: new Date(s.ts),
          },
        }),
      ),
    );
  }

  async findPage(params: FindPageParams): Promise<{ items: UserEntity[]; total: number }> {
    const where: Prisma.UserWhereInput = {};
    if (params.keyword) {
      where.OR = [
        { username: { contains: params.keyword } },
        { nickname: { contains: params.keyword } },
      ];
    }
    if (params.role) {
      // 角色以 JSON 子串匹配（如 "user"），与计数同层保证 total 正确
      where.rolesJson = { contains: `"${params.role}"` };
    }
    const [field, dir] = Object.entries(params.order)[0] ?? ['createdAt', 'DESC'];
    const orderBy = { [field]: dir.toLowerCase() as 'asc' | 'desc' };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, orderBy, skip: params.skip, take: params.take }),
      this.prisma.user.count({ where }),
    ]);
    return { items: rows.map((row) => this.toEntity(row)), total };
  }

  async findByUsername(username: string): Promise<UserEntity | null> {
    const row = await this.prisma.user.findUnique({ where: { username } });
    return row ? this.toEntity(row) : null;
  }

  async existsByUsername(username: string): Promise<boolean> {
    return (await this.prisma.user.count({ where: { username } })) > 0;
  }

  async findById(id: string): Promise<UserEntity | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? this.toEntity(row) : null;
  }

  async create(data: CreateParams): Promise<UserEntity> {
    const row = await this.prisma.user.create({
      data: {
        username: data.username,
        passwordHash: data.passwordHash,
        nickname: data.nickname,
        rolesJson: JSON.stringify(data.roles),
      },
    });
    return this.toEntity(row);
  }

  async update(
    id: string,
    patch: { nickname?: string; roles?: string[] },
  ): Promise<UserEntity | null> {
    const data: Prisma.UserUpdateInput = {};
    if (patch.nickname !== undefined) data.nickname = patch.nickname;
    if (patch.roles !== undefined) data.rolesJson = JSON.stringify(patch.roles);
    try {
      const row = await this.prisma.user.update({ where: { id }, data });
      return this.toEntity(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') return null;
      throw e;
    }
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.prisma.user.deleteMany({ where: { id } });
    return result.count > 0;
  }

  /** 行记录 → 应用层实体（roles 反序列化；时间转 ISO 字符串） */
  private toEntity(row: UserRow): UserEntity {
    let roles: string[] = [];
    try {
      const parsed: unknown = JSON.parse(row.rolesJson);
      if (Array.isArray(parsed)) roles = parsed.filter((r): r is string => typeof r === 'string');
    } catch {
      roles = [];
    }
    return {
      id: row.id,
      username: row.username,
      passwordHash: row.passwordHash,
      nickname: row.nickname,
      roles,
      disabled: row.disabled,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
