import { SetMetadata, type CustomDecorator } from '@nestjs/common';

/**
 * admin 权限元数据 key（模块内集中管理，避免魔法字符串散落）。
 * 独立于底座 ROLES_KEY：@Roles 为阶段一（JWT 快照），@RequirePerm 为阶段二（实时授权）。
 */
export const PERM_KEY = 'admin:perm';

export interface PermMeta {
  /** 所需权限码（约定 <domain>:<resource>:<action>） */
  code: string;
}

/**
 * 实时权限声明（RBAC 阶段二）：由 admin 模块的 PermissionGuard 校验，
 * 权限集合每请求经 RbacService 从库解析（缓存 + 写失效），改授权即时生效、无需重新登录。
 * 与底座 @Roles 可叠加：@Roles 管粗粒度角色墙，@RequirePerm 管细粒度权限点。
 * 用法：@RequirePerm('admin:role:list')
 */
export const RequirePerm = (code: string): CustomDecorator<string> =>
  SetMetadata(PERM_KEY, { code } satisfies PermMeta);
