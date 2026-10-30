import { SetMetadata } from '@nestjs/common';
import { ROLES_KEY } from '../constants/metadata.constants';

/**
 * RBAC 阶段一：声明端点所需角色（任一满足即通过），由全局 RolesGuard 校验。
 * 用法：@Roles('admin') 或 @Roles('admin', 'ops')
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
