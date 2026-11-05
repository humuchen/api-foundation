import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../../../contracts/index.js';
import type { MenuNode } from '../menu/menu.repository.js';
import { MenuService } from '../menu/menu.service.js';
import { RbacService } from '../rbac/rbac.service.js';
import { SysConfigService } from '../sysconfig/sysconfig.service.js';
import { UserService } from '../../user/user.service.js';

/** bootstrap 聚合视图：后台前端启动即取的完整上下文 */
export interface AdminBootstrapVo {
  user: { id: string; username: string; nickname: string; roles: string[] };
  /** 当前用户权限码全集（'*' = 超管通配；前端按钮级权限 v-perm 直接消费） */
  permissions: string[];
  /** 可见菜单树（动态路由数据源） */
  menus: MenuNode[];
  /** ui 组配置映射（key → value；theme/layout 主题与布局下发） */
  ui: Record<string, Record<string, unknown>>;
}

/**
 * bootstrap 聚合服务：一次往返返回后台壳应用（shell）所需的全部上下文，
 * 替代前端串行拉取 user/permissions/menus/ui 的多次请求。
 */
@Injectable()
export class AdminBootstrapService {
  constructor(
    private readonly userService: UserService,
    private readonly rbacService: RbacService,
    private readonly menuService: MenuService,
    private readonly sysConfigService: SysConfigService,
  ) {}

  async forActor(actor: AuthUser): Promise<AdminBootstrapVo> {
    const [me, permissionCodes, menus, uiConfigs] = await Promise.all([
      this.userService.findMe(actor.id),
      this.rbacService.resolvePermissionCodes(actor),
      this.menuService.visibleTreeFor(actor),
      this.sysConfigService.listByGroup('ui'),
    ]);
    return {
      user: {
        id: me.id,
        username: me.username,
        nickname: me.nickname,
        roles: me.roles,
      },
      permissions: [...permissionCodes],
      menus,
      ui: Object.fromEntries(uiConfigs.map((c) => [c.key, c.value])),
    };
  }
}
