import { Cache } from '@nestjs/cache-manager';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { compare, hash } from 'bcryptjs';
import { ErrorCode } from '../../common/error-codes';
import { BizException } from '../../common/exceptions/biz.exception';
import { buildPage, PageVo } from '../../common/responses/page.vo';
import { toQueryOptions } from '../../common/utils/query.util';
import { UserChangedEvent } from './user.events';
import { CreateUserDto, UpdateUserDto, UserQueryDto } from './user.dto';
import { UserEntity, UserRepository } from './user.repository';

/** 可排序字段白名单（防排序注入；随实体字段扩展） */
export const USER_SORTABLE_FIELDS = ['createdAt', 'username', 'nickname'];

/** 对外视图：杜绝 passwordHash 外泄 */
export interface UserVo {
  id: string;
  username: string;
  nickname: string;
  roles: string[];
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
}

function toVo(u: UserEntity): UserVo {
  const { passwordHash: _hash, ...rest } = u;
  return rest;
}

const PAGE_CACHE_TTL_MS = 30_000;
const PAGE_VERSION_KEY = 'users:page:ver';

/**
 * 用户服务：user 模块为底座契约的参考实现（分页 + RBAC + 校验 + 统一响应 + 缓存 + 领域事件）。
 * 缓存策略：分页结果按查询指纹缓存 30s，失效采用「版本号递增」（Keyv 无前缀扫描，
 * 版本键轮转等价于批量失效）；写操作先失效缓存再发领域事件，保证本请求读到自己写。
 * verifyCredentials 供 infra/auth（登录）调用 —— 用户数据归属业务域，鉴权层只消费公开 API。
 */
@Injectable()
export class UserService {
  constructor(
    private readonly repository: UserRepository,
    private readonly cache: Cache,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findPage(query: UserQueryDto): Promise<PageVo<UserVo>> {
    const ver = await this.pageVersion();
    const key = `users:page:v${ver}:${query.page}:${query.pageSize}:${query.sort ?? ''}:${query.keyword ?? ''}:${query.role ?? ''}`;
    const cached = await this.cache.get<PageVo<UserVo>>(key);
    if (cached) return cached;

    const opts = toQueryOptions(query, USER_SORTABLE_FIELDS);
    const { items, total } = await this.repository.findPage({
      skip: opts.skip,
      take: opts.take,
      order: opts.order,
      keyword: query.keyword,
      role: query.role,
    });
    const page = buildPage(items.map(toVo), total, opts.page, opts.pageSize);
    await this.cache.set(key, page, PAGE_CACHE_TTL_MS);
    return page;
  }

  async findOne(id: string): Promise<UserVo> {
    const user = await this.repository.findById(id);
    if (!user) throw new BizException(ErrorCode.NOT_FOUND, '用户不存在');
    return toVo(user);
  }

  /** 当前登录用户自我查询（/users/me） */
  async findMe(id: string): Promise<UserVo> {
    return this.findOne(id);
  }

  async create(dto: CreateUserDto, actorUsername?: string): Promise<UserVo> {
    if (await this.repository.existsByUsername(dto.username)) {
      throw new BizException(ErrorCode.CONFLICT, '用户名已存在');
    }
    const user = await this.repository.create({
      username: dto.username,
      passwordHash: await hash(dto.password, 10),
      nickname: dto.nickname?.trim() || dto.username,
      roles: dto.roles,
    });
    await this.invalidatePageCache();
    this.emitChanged('created', user, actorUsername);
    return toVo(user);
  }

  async update(id: string, dto: UpdateUserDto, actorUsername?: string): Promise<UserVo> {
    const patch: { nickname?: string; roles?: string[] } = {};
    if (dto.nickname !== undefined) patch.nickname = dto.nickname;
    if (dto.roles !== undefined) patch.roles = dto.roles;
    const updated = await this.repository.update(id, patch);
    if (!updated) throw new BizException(ErrorCode.NOT_FOUND, '用户不存在');
    await this.invalidatePageCache();
    this.emitChanged('updated', updated, actorUsername);
    return toVo(updated);
  }

  async remove(id: string, actorUsername?: string): Promise<{ id: string }> {
    const ok = await this.repository.remove(id);
    if (!ok) throw new BizException(ErrorCode.NOT_FOUND, '用户不存在');
    await this.invalidatePageCache();
    this.emitChanged('deleted', { id, username: id }, actorUsername);
    return { id };
  }

  /** 登录凭证校验：失败统一 20001（不区分用户名/密码，防账号探测）；禁用账号 20004 */
  async verifyCredentials(username: string, password: string): Promise<UserVo> {
    const user = await this.repository.findByUsername(username);
    const matched = user ? await compare(password, user.passwordHash) : false;
    if (!user || !matched) throw new BizException(ErrorCode.UNAUTHORIZED, '用户名或密码错误');
    if (user.disabled) throw new BizException(ErrorCode.ACCOUNT_DISABLED);
    return toVo(user);
  }

  /** 分页缓存版本号（递增即批量失效） */
  private async pageVersion(): Promise<number> {
    return (await this.cache.get<number>(PAGE_VERSION_KEY)) ?? 1;
  }

  private async invalidatePageCache(): Promise<void> {
    const ver = await this.pageVersion();
    await this.cache.set(PAGE_VERSION_KEY, ver + 1, 86_400_000);
  }

  /** 领域事件：下游副作用（通知/索引/统计）经监听器解耦，见 user.events.ts */
  private emitChanged(
    action: UserChangedEvent['action'],
    user: { id: string; username: string },
    actorUsername?: string,
  ): void {
    this.eventEmitter.emit('user.changed', {
      action,
      userId: user.id,
      username: user.username,
      actorUsername: actorUsername ?? null,
    } satisfies UserChangedEvent);
  }
}
