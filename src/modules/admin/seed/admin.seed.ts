import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../infra/database/prisma.service.js';
import { getLogger } from '../../../infra/logger/index.js';

/** 种子角色（builtin=true 受保护：不可删、不可改 code） */
const SEED_ROLES = [
  { code: 'admin', name: '系统管理员', description: '超管角色：通配全部权限点（含后续新增）', builtin: true, sort: 0 },
  { code: 'ops', name: '运营人员', description: '业务运营角色：按需授权', builtin: false, sort: 10 },
  { code: 'user', name: '普通用户', description: '只读/自助角色：按需授权', builtin: false, sort: 20 },
] as const;

/** 种子权限点（code/name/resource/action/type） */
const SEED_PERMISSIONS: Array<{
  code: string;
  name: string;
  resource: string;
  action: string;
  type: string;
}> = [
  { code: 'admin:user-role:list', name: '查询用户角色绑定', resource: 'user-role', action: 'list', type: 'api' },
  { code: 'admin:user-role:bind', name: '绑定用户角色', resource: 'user-role', action: 'bind', type: 'api' },
  { code: 'admin:role:list', name: '角色列表', resource: 'role', action: 'list', type: 'api' },
  { code: 'admin:role:create', name: '创建角色', resource: 'role', action: 'create', type: 'api' },
  { code: 'admin:role:update', name: '更新角色', resource: 'role', action: 'update', type: 'api' },
  { code: 'admin:role:delete', name: '删除角色', resource: 'role', action: 'delete', type: 'api' },
  { code: 'admin:role:grant', name: '角色授权', resource: 'role', action: 'grant', type: 'api' },
  { code: 'admin:permission:list', name: '权限点列表', resource: 'permission', action: 'list', type: 'api' },
  { code: 'admin:permission:create', name: '创建权限点', resource: 'permission', action: 'create', type: 'api' },
  { code: 'admin:menu:list', name: '菜单列表', resource: 'menu', action: 'list', type: 'api' },
  { code: 'admin:menu:create', name: '创建菜单', resource: 'menu', action: 'create', type: 'api' },
  { code: 'admin:menu:update', name: '更新菜单', resource: 'menu', action: 'update', type: 'api' },
  { code: 'admin:menu:delete', name: '删除菜单', resource: 'menu', action: 'delete', type: 'api' },
  { code: 'admin:dict:list', name: '字典列表', resource: 'dict', action: 'list', type: 'api' },
  { code: 'admin:dict:create', name: '创建字典', resource: 'dict', action: 'create', type: 'api' },
  { code: 'admin:dict:update', name: '更新字典', resource: 'dict', action: 'update', type: 'api' },
  { code: 'admin:dict:delete', name: '删除字典', resource: 'dict', action: 'delete', type: 'api' },
  { code: 'admin:config:list', name: '配置列表', resource: 'config', action: 'list', type: 'api' },
  { code: 'admin:config:create', name: '创建配置', resource: 'config', action: 'create', type: 'api' },
  { code: 'admin:config:update', name: '更新配置', resource: 'config', action: 'update', type: 'api' },
  { code: 'admin:config:delete', name: '删除配置', resource: 'config', action: 'delete', type: 'api' },
  { code: 'admin:audit:list', name: '审计查询', resource: 'audit', action: 'list', type: 'api' },
  { code: 'demo:product:list', name: '商品列表', resource: 'product', action: 'list', type: 'api' },
  { code: 'demo:product:create', name: '创建商品', resource: 'product', action: 'create', type: 'api' },
  { code: 'demo:product:update', name: '更新商品', resource: 'product', action: 'update', type: 'api' },
  { code: 'demo:product:delete', name: '删除商品', resource: 'product', action: 'delete', type: 'api' },
];

/** ops 角色的演示授权（受限权限集，用于验证权限过滤） */
const SEED_OPS_PERMISSIONS = ['demo:product:list', 'demo:product:create', 'demo:product:update', 'admin:dict:list'];

/** 种子菜单（parentId 由 path 在运行期解析；builtin=true 受保护） */
const SEED_MENUS = [
  { path: '/dashboard', name: '仪表盘', type: 'menu', sort: 0, builtin: true, parent: null, permCode: null, component: 'dashboard/Dashboard', icon: 'gauge', meta: { title: '仪表盘', keepAlive: true } },
  { path: '/system', name: '系统管理', type: 'directory', sort: 90, builtin: true, parent: null, permCode: null, component: null, icon: 'settings', meta: { title: '系统管理' } },
  { path: '/system/user-roles', name: '用户角色', type: 'menu', sort: 1, builtin: true, parent: '/system', permCode: 'admin:user-role:list', component: 'admin/UserRoleList', icon: 'user-cog', meta: { title: '用户角色' } },
  { path: '/system/roles', name: '角色权限', type: 'menu', sort: 2, builtin: true, parent: '/system', permCode: 'admin:role:list', component: 'admin/RoleList', icon: 'shield', meta: { title: '角色权限' } },
  { path: '/system/menus', name: '菜单路由', type: 'menu', sort: 3, builtin: true, parent: '/system', permCode: 'admin:menu:list', component: 'admin/MenuList', icon: 'menu', meta: { title: '菜单路由' } },
  { path: '/system/dicts', name: '字典管理', type: 'menu', sort: 4, builtin: true, parent: '/system', permCode: 'admin:dict:list', component: 'admin/DictList', icon: 'book', meta: { title: '字典管理' } },
  { path: '/system/configs', name: '参数配置', type: 'menu', sort: 5, builtin: true, parent: '/system', permCode: 'admin:config:list', component: 'admin/SysConfigList', icon: 'sliders', meta: { title: '参数配置' } },
  { path: '/system/audit-logs', name: '操作审计', type: 'menu', sort: 6, builtin: true, parent: '/system', permCode: 'admin:audit:list', component: 'admin/AuditLogList', icon: 'history', meta: { title: '操作审计' } },
  { path: '/demo/products', name: '商品管理', type: 'menu', sort: 50, builtin: false, parent: null, permCode: 'demo:product:list', component: 'demo/ProductList', icon: 'package', meta: { title: '商品管理', crudResource: 'products' } },
] as const;

/** 种子字典（类型 + 项） */
const SEED_DICTS: Array<{ code: string; name: string; items: Array<{ value: string; label: string; sort: number }> }> = [
  {
    code: 'demo_category',
    name: '商品分类',
    items: [
      { value: 'electronics', label: '数码', sort: 1 },
      { value: 'apparel', label: '服饰', sort: 2 },
      { value: 'food', label: '食品', sort: 3 },
      { value: 'other', label: '其他', sort: 9 },
    ],
  },
  {
    code: 'demo_status',
    name: '商品状态',
    items: [
      { value: 'draft', label: '草稿', sort: 1 },
      { value: 'published', label: '已发布', sort: 2 },
      { value: 'archived', label: '已归档', sort: 3 },
    ],
  },
];

/** 种子配置（ui 组承载前端主题/布局约定，sys 组承载站点信息） */
const SEED_CONFIGS: Array<{ key: string; group: string; value: Record<string, unknown>; description: string }> = [
  {
    key: 'ui.theme',
    group: 'ui',
    value: { primary: '#4f6ef2', mode: 'light', radius: 8, compact: false },
    description: '主题：主色/模式(light|dark|auto)/圆角/紧凑（前端映射为 CSS 变量，多主题入口）',
  },
  {
    key: 'ui.layout',
    group: 'ui',
    value: {
      mode: 'sidebar',
      sidebarCollapsed: false,
      responsive: { xs: 480, sm: 768, md: 1024, lg: 1280, xl: 1536 },
    },
    description: '布局：布局模式(sidebar|top|mix)/侧栏折叠/响应式断点（前端据此切换响应式布局）',
  },
  {
    key: 'sys.siteName',
    group: 'sys',
    value: { name: '通用后台管理系统', copyright: 'api-foundation' },
    description: '站点信息',
  },
];

/**
 * 幂等种子（AdminModule.forRoot({ seed: true }) 默认启用）：
 * 全部 upsert，仅增量补齐、绝不覆盖运行期修改（createMany skipDuplicates 只补缺失授权）。
 * 超管绑定依赖 users.admin 存在（UserModule 种子先行；未就绪时跳过、下次启动补绑）。
 */
@Injectable()
export class AdminSeed implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.seedRoles();
      await this.seedPermissions();
      await this.seedRoleGrants();
      await this.seedSuperBinding();
      await this.seedMenus();
      await this.seedDicts();
      await this.seedConfigs();
    } catch (err) {
      getLogger().warn({ err }, '[admin-seed] 种子写入失败（首次部署请先执行 prisma migrate/db push）');
    }
  }

  private async seedRoles(): Promise<void> {
    for (const role of SEED_ROLES) {
      await this.prisma.adminRole.upsert({
        where: { code: role.code },
        update: {},
        create: { ...role },
      });
    }
  }

  private async seedPermissions(): Promise<void> {
    for (const permission of SEED_PERMISSIONS) {
      await this.prisma.adminPermission.upsert({
        where: { code: permission.code },
        update: {},
        create: { ...permission },
      });
    }
  }

  /** admin 角色补齐全部权限点（新增权限自动获得）；ops 角色补齐演示授权 */
  private async seedRoleGrants(): Promise<void> {
    const roles = await this.prisma.adminRole.findMany({ select: { id: true, code: true } });
    const permissions = await this.prisma.adminPermission.findMany({ select: { id: true, code: true } });
    const roleByCode = new Map(roles.map((r) => [r.code, r.id] as const));
    const permIdByCode = new Map(permissions.map((p) => [p.code, p.id] as const));

    const grants: Array<{ roleId: string; permissionId: string }> = [];
    const adminRoleId = roleByCode.get('admin');
    if (adminRoleId) {
      for (const permissionId of permIdByCode.values()) {
        grants.push({ roleId: adminRoleId, permissionId });
      }
    }
    const opsRoleId = roleByCode.get('ops');
    if (opsRoleId) {
      for (const code of SEED_OPS_PERMISSIONS) {
        const permissionId = permIdByCode.get(code);
        if (permissionId) grants.push({ roleId: opsRoleId, permissionId });
      }
    }
    // SQLite 的 createMany 不支持 skipDuplicates：逐条 upsert（复合主键幂等，仅补缺失）
    for (const grant of grants) {
      await this.prisma.adminRolePermission.upsert({
        where: { roleId_permissionId: { roleId: grant.roleId, permissionId: grant.permissionId } },
        update: {},
        create: grant,
      });
    }
  }

  /** 内置 admin 账号 → 超管角色（绑定表为实时授权主通道） */
  private async seedSuperBinding(): Promise<void> {
    const [user, role] = await Promise.all([
      this.prisma.user.findUnique({ where: { username: 'admin' }, select: { id: true } }),
      this.prisma.adminRole.findUnique({ where: { code: 'admin' }, select: { id: true } }),
    ]);
    if (!user || !role) return;
    await this.prisma.adminUserRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
  }

  private async seedMenus(): Promise<void> {
    const pathToId = new Map<string, string>();
    for (const menu of SEED_MENUS) {
      const parentId = menu.parent ? pathToId.get(menu.parent) ?? null : null;
      const row = await this.prisma.adminMenu.upsert({
        where: { path: menu.path },
        update: {},
        create: {
          name: menu.name,
          path: menu.path,
          type: menu.type,
          sort: menu.sort,
          builtin: menu.builtin,
          parentId,
          permCode: menu.permCode,
          component: menu.component,
          icon: menu.icon,
          metaJson: JSON.stringify(menu.meta),
        },
      });
      pathToId.set(menu.path, row.id);
    }
  }

  private async seedDicts(): Promise<void> {
    for (const dict of SEED_DICTS) {
      await this.prisma.adminDictType.upsert({
        where: { code: dict.code },
        update: {},
        create: { code: dict.code, name: dict.name },
      });
      for (const item of dict.items) {
        await this.prisma.adminDictItem.upsert({
          where: { typeCode_value: { typeCode: dict.code, value: item.value } },
          update: {},
          create: { typeCode: dict.code, value: item.value, label: item.label, sort: item.sort },
        });
      }
    }
  }

  private async seedConfigs(): Promise<void> {
    for (const config of SEED_CONFIGS) {
      await this.prisma.adminSysConfig.upsert({
        where: { key: config.key },
        update: {},
        create: {
          key: config.key,
          group: config.group,
          valueJson: JSON.stringify(config.value),
          description: config.description,
          builtin: true,
        },
      });
    }
  }
}
