# 通用后台管理系统模块设计（src/modules/admin）

> 状态：已落地（RBAC / 菜单动态路由 / 通用 CRUD 引擎 / 字典 / 配置 / 审计查询 / bootstrap 聚合）。
> 依赖底座：FoundationModule（全局 Pipe/Guard/Filter/Interceptor）、PrismaService、Cache、AUDIT_SINK 审计管线、统一响应与分页契约。

## 1. 目标与设计原则

在 NestJS 通用后端底座上提供「一行装配」的通用后台管理域能力，覆盖：

| 能力 | 承载 | 关键机制 |
| --- | --- | --- |
| 可配置的权限与角色管理 | `rbac/` | 角色/权限点/授权/用户绑定四组模型 + `@RequirePerm` 实时权限守卫 |
| 菜单与路由动态生成 | `menu/` | 菜单树 + `permCode` 可见性过滤 + `meta` 路由元信息下发 |
| 通用 CRUD 数据表格与表单 | `crud/` | 实体定义注册表 → 动态 REST 端点 + `/schema` 元数据下发 |
| 字典与配置管理 | `dict/` `sysconfig/` | 字典类型/项缓存读取；分组配置（`ui` 组承载主题/布局） |
| 日志与操作审计 | `auditlog/` | 分页筛选查询（写入复用底座 `@Audit → AuditInterceptor → AUDIT_SINK` 管线） |
| 响应式布局与多主题 | `sysconfig` + 菜单 `meta` | `ui.theme` / `ui.layout` 配置下发 + 页面级 meta 覆写（前端约定见 §7） |

设计原则：

1. **元数据驱动、界面解耦**：表格列/表单项/筛选/排序全部由 `CrudEntityDefinition` 单一事实来源描述，后端不感知 UI，前端渲染器（任意框架）消费 `/schema` 与 `/bootstrap` 即可渲染，零硬编码。
2. **插件化**：一个业务场景 = 一组实体定义 + 一组权限点 + 一组菜单/字典/配置数据；注册即接入，卸载即退出，核心引擎不感知具体业务。
3. **复用底座契约**：分页走 `PaginationDto/toQueryOptions/buildPage`；错误码登记于 `common/error-codes.ts` 33xxx 段；审计写入复用底座管线（仅动态动作经 `{param}` 占位符展开）；鉴权复用 `JwtAuthGuard`（本模块只做「权限点解析」这一层）。
4. **实时授权 + 快照兼容双轨**：`@Roles`（JWT 角色快照，粗粒度角色墙）保持不变；`@RequirePerm`（库内实时解析，改权即生效）为细粒度权限点，二者可叠加。

## 2. 模块结构划分

```
src/modules/admin/
├── index.ts                  # 出口：AdminModule / 契约类型 / @RequirePerm / CrudRegistry
├── admin.module.ts           # AdminModule.forRoot(options)：唯一装配点（集中注册全部子域 Provider）
├── admin.types.ts            # AdminModuleOptions（装配配置）+ ADMIN_SUPER_ROLE Token
├── admin.contracts.ts        # 契约：CrudEntityDefinition / CrudFieldSchema / CrudHooks / CrudRequestContext
├── seed/admin.seed.ts        # 幂等种子：内置角色/权限点/菜单/字典/ui 配置/超管绑定
├── rbac/                     # ── 权限与角色管理
│   ├── rbac.repository.ts    #   角色/权限点/绑定表持久化（无 relation，跨表手动组装）
│   ├── rbac.service.ts       #   CRUD + 授权 + 绑定 + 实时权限解析（缓存 + 版本号失效）
│   ├── rbac.controller.ts    #   /admin/rbac/*
│   ├── rbac.dto.ts
│   ├── perm.decorator.ts     #   @RequirePerm(code)（PERM_KEY 元数据）
│   └── perm.guard.ts         #   PermissionGuard（APP_GUARD，位于底座三守卫之后）
├── menu/                     # ── 菜单与动态路由
│   ├── menu.repository.ts    #   admin_menus 持久化（metaJson ↔ meta 映射）
│   ├── menu.service.ts       #   树组装 / permCode 过滤 / 环检测 / 全量树缓存
│   ├── menu.controller.ts    #   /admin/menus/tree | my | CRUD
│   └── menu.dto.ts
├── crud/                     # ── 通用 CRUD 引擎
│   ├── crud.registry.ts      #   实体定义注册表（注册期 fail-fast 结构校验）
│   ├── crud.validator.ts     #   运行时校验器（纯函数：白名单/类型收敛/必填/defaultValue/只读剥离）
│   ├── crud.service.ts       #   动态 delegate 读写 / 过滤白名单 / 权限码动态校验 / hooks 编排
│   └── crud.controller.ts    #   /admin/crud/:resource 动态端点族 + schema/_registry
├── dict/                     # ── 字典管理
│   ├── dict.repository.ts / dict.service.ts / dict.controller.ts / dict.dto.ts
├── sysconfig/                # ── 系统配置（ui 主题/布局下发）
│   ├── sysconfig.repository.ts / sysconfig.service.ts / sysconfig.controller.ts / sysconfig.dto.ts
├── auditlog/                 # ── 审计查询（读；写走底座管线）
│   ├── audit-log.repository.ts / audit-log.service.ts / audit-log.controller.ts / audit-log.dto.ts
└── bootstrap/                # ── 启动聚合端点
    ├── bootstrap.service.ts  #   user + permissions + menus + ui 一次拉取
    └── bootstrap.controller.ts
```

**装配拓扑说明**：子域按目录组织类文件而非独立 `@Module()` —— 由 `AdminModule.forRoot` 统一装配。原因：`RbacService` 被 menu（可见性过滤）/crud（动态端点鉴权）/bootstrap（权限清单）横向消费，若各子模块分别 `import` RBAC 动态模块，参数不同的 forRoot 会产生重复实例与重复路由；集中装配与底座 `FoundationModule` 组合根模式一致。

数据模型（随核心包 `prisma/fragments/foundation.prisma` 发布，业务侧目录模式自动合并）：

| 模型 | 表名 | 说明 |
| --- | --- | --- |
| `AdminRole` | `admin_roles` | 角色（code 唯一；builtin 受保护） |
| `AdminPermission` | `admin_permissions` | 权限点（code 唯一；resource/action/type） |
| `AdminRolePermission` | `admin_role_permissions` | 角色-权限绑定（复合主键，全量替换式授权） |
| `AdminUserRole` | `admin_user_roles` | 用户-角色绑定（实时授权主通道） |
| `AdminMenu` | `admin_menus` | 菜单树（parentId 自引用；metaJson 路由元信息） |
| `AdminDictType` / `AdminDictItem` | `admin_dict_types` / `admin_dict_items` | 字典（typeCode 冗余引用免 join；(typeCode,value) 唯一） |
| `AdminSysConfig` | `admin_sys_configs` | 配置（key 唯一点分命名；group 分组；valueJson 任意 JSON） |

## 3. 关键接口（前缀 /api/v1）

### 3.1 聚合与菜单

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/admin/bootstrap` | 登录 | 启动聚合：user / permissions（`*`=超管）/ 可见菜单树 / ui 配置 |
| GET | `/admin/menus/tree` | `admin:menu:list` | 全量菜单树（管理端维护视图） |
| GET | `/admin/menus/my` | 登录 | 当前用户可见树（**前端动态路由数据源**） |
| POST/PATCH/DELETE | `/admin/menus[/:id]` | `admin:menu:*` | 菜单 CRUD（内置/含子级受保护；父级环检测） |

### 3.2 RBAC

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET/POST | `/admin/rbac/roles` | `admin:role:list/create` | 角色列表 / 创建 |
| PATCH/DELETE | `/admin/rbac/roles/:id` | `admin:role:update/delete` | 更新（code 不可改）/ 删除（内置 33003、有绑定 33004 拒绝） |
| GET/POST | `/admin/rbac/permissions` | `admin:permission:list/create` | 权限点列表（?resource=）/ 创建（业务自定义权限入口） |
| GET/PUT | `/admin/rbac/roles/:id/permissions` | `admin:role:list/grant` | 授权回显 / 全量替换授权（**即时生效**） |
| GET/PUT | `/admin/rbac/users/:userId/roles` | `admin:user-role:list/bind` | 用户绑定角色回显 / 全量替换绑定（**即时生效，无需重登**） |

### 3.3 字典与配置

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/admin/dicts/:code/items` | 登录 | 字典项（**表单选项数据源**；?includeDisabled= 管理视图） |
| GET/POST/PATCH/DELETE | `/admin/dicts/types[/:id]`、`/admin/dicts/:code/items`、`/admin/dicts/items/:id` | `admin:dict:*` | 字典类型/项管理（builtin 类型不可删） |
| GET | `/admin/configs?group=ui` | 登录 | 按组读取（**ui 组 = 主题/布局下发**） |
| POST/PUT/DELETE | `/admin/configs[/:key]` | `admin:config:*` | 配置 CRUD（内置不可删；更新允许） |

### 3.4 通用 CRUD 引擎（动态端点族）

| 方法 | 路径 | 权限码 | 说明 |
| --- | --- | --- | --- |
| GET | `/admin/crud/_registry` | 登录 | 已注册资源摘要（动态工作台） |
| GET | `/admin/crud/:resource/schema` | 登录 | **表格列+表单项元数据**（定义原样下发） |
| GET | `/admin/crud/:resource` | `<prefix>:list` | 分页：`?page&pageSize&sort&keyword&<inFilter 字段>`（string 模糊 / 其余等值；排序白名单防注入） |
| GET | `/admin/crud/:resource/:id` | `<prefix>:list` | 详情 |
| POST/PATCH/DELETE | `/admin/crud/:resource[/:id]` | `<prefix>:create/update/delete` | 写路径（运行时校验 33402 明细；readOnly 资源 33404） |

权限码前缀 `permissionPrefix` 缺省 `crud:<resource>`，可按实体覆盖（如 `demo:product`）。动态端点的权限在 `CrudService` 内显式校验（资源运行期才可知），其余静态端点用 `@RequirePerm` 装饰器。

### 3.5 审计查询

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/admin/audit-logs` | `admin:audit:list` | 分页筛选：action（支持前缀通配 `admin:role:*`）/ actorUsername / success / tenantId / start / end |

写入链路不变：`@Audit → AuditInterceptor → AUDIT_SINK`（record/脱敏/降级内存）；本模块仅补齐面向界面的分页查询。动态 CRUD 端点经动作占位符 `@Audit('crud:{resource}:create')` 展开为 `crud:products:create`（`AuditInterceptor` 向后兼容增强）。

## 4. 关键类型与扩展点定义

### 4.1 实体定义（`admin.contracts.ts`）—— 业务接入的单一入口

```ts
export interface CrudEntityDefinition {
  resource: string;            // 路由段 /admin/crud/products
  model: string;               // Prisma delegate 属性名（demoProduct）
  title: string;
  permissionPrefix?: string;   // 缺省 crud:<resource>
  readOnly?: boolean;          // 只读资源：仅读端点
  baseWhere?: Record<string, unknown>;  // 全局过滤（如软删除）
  defaultSort?: string;
  fields: CrudFieldSchema[];   // 表格/表单字段元数据
  hooks?: CrudHooks;           // 生命周期钩子
}

export interface CrudFieldSchema {
  key: string; label: string;
  type: 'string'|'text'|'number'|'integer'|'boolean'|'date'|'datetime'|'enum'|'dict'|'json';
  required?: boolean;          // 表单必填
  inFilter?: boolean;          // 列表筛选（string→contains，其余等值）
  sortable?: boolean;          // 排序白名单
  inList?: boolean; inForm?: boolean;   // 表格列/表单项开关
  readOnly?: boolean;          // update 时剥离
  dictType?: string;           // type=dict → 前端经 /admin/dicts/:code/items 拉选项
  options?: CrudFieldOption[]; // type=enum 静态选项
  min?: number; max?: number; maxLength?: number; pattern?: string;
  placeholder?: string; help?: string; width?: number|string; defaultValue?: unknown;
}

export interface CrudHooks {
  beforeCreate?(data, ctx): Promise<Record<string, unknown>> | Record<string, unknown>;
  beforeUpdate?(id, data, ctx): ...;
  beforeDelete?(id, ctx): Promise<void> | void;   // 抛 BizException 阻断
  afterCreate?(row, ctx): Promise<void> | void;
  afterUpdate?(row, ctx): ...;
}
// ctx: { actor: { id, username, roles }, tenantId } —— 租户注入/软删除/关联校验/事件通知在此实现
```

**注册方式（二选一，等价）**：

```ts
// 方式一：配置式（AdminModule 装配期注册，启动 fail-fast）
AdminModule.forRoot({ crudEntities: [OrderEntityDef, ArticleEntityDef] })

// 方式二：运行时（业务模块 onModuleInit 注入注册表）
constructor(private readonly registry: CrudRegistry) {}
onModuleInit(): void { this.registry.register(OrderEntityDef); }
```

### 4.2 装配配置（`AdminModuleOptions`）

```ts
export interface AdminModuleOptions {
  crudEntities?: CrudEntityDefinition[];  // 配置式实体注册
  enablePermissionGuard?: boolean;        // 缺省 true；false 退回纯 @Roles 模式
  seed?: boolean;                         // 缺省 true；生产可关改迁移脚本初始化
  superRole?: string;                     // 缺省 'admin'（通配全部权限点）
}
```

### 4.3 权限解析（rbac）

```
resolvePermissionCodes(actor) =
  绑定角色(admin_user_roles，disabled 过滤) ∪ JWT roles 中真实存在且启用的角色
  → 命中 superRole ⇒ 通配哨兵 '*'
  → 否则 role → admin_role_permissions → admin_permissions.code 全集
缓存：admin:perm:v{ver}:{userId}（TTL 30s）；写路径（角色/授权/绑定变更）递增 ver 批量失效。
```

执行顺序：`ThrottlerGuard → JwtAuthGuard → RolesGuard(@Roles) → PermissionGuard(@RequirePerm)`。
未命中 → `20003 FORBIDDEN`，`data.requiredPermission` 供前端引导。

### 4.4 错误码（登记于 `src/common/error-codes.ts`，33xxx 段）

| 分段 | 码 | 语义 |
| --- | --- | --- |
| RBAC 3300x | 33001-33006 | 角色不存在/编码冲突/内置锁定/仍被绑定；权限点不存在/编码冲突 |
| 菜单 3310x | 33101-33105 | 不存在/路径冲突/内置锁定/父级非法/含子级 |
| 字典 3320x | 33201-33205 | 类型不存在/编码冲突/内置锁定/项不存在/值冲突 |
| 配置 3330x | 33301-33304 | 不存在/键冲突/内置锁定/值非法 |
| CRUD 3340x | 33401-33404 | 资源未注册/字段校验失败（data.details 明细）/模型缺失/只读资源 |
| 绑定 3350x | 33501 | 待绑定用户不存在 |

## 5. 配置约定

### 5.1 命名约定

- **权限码**：`<domain>:<resource>:<action>`（如 `admin:role:list`、`demo:product:create`）；action ∈ `list|create|update|delete|grant|bind|...`；按钮级权限 `type: 'button'`。
- **审计动作**：`<domain>:<resource>:<action>`（与权限码同构，如 `admin:role:create`）；动态端点用占位符 `crud:{resource}:create`。
- **配置键**：点分命名 `<group>.<key>`（如 `ui.theme`）；group ∈ `ui|sys|brand|...`。
- **字典编码**：`<domain>_<语义>`（如 `demo_category`）。

### 5.2 `ui` 组配置约定（响应式布局与多主题的载体）

```jsonc
// ui.theme —— 前端映射为 CSS 变量（多主题入口）
{ "primary": "#4f6ef2", "mode": "light", "radius": 8, "compact": false }
// mode: light | dark | auto（跟随系统）

// ui.layout —— 前端布局切换与断点（响应式布局入口）
{ "mode": "sidebar", "sidebarCollapsed": false,
  "responsive": { "xs": 480, "sm": 768, "md": 1024, "lg": 1280, "xl": 1536 } }
// mode: sidebar | top | mix
```

页面级覆写：菜单 `meta` 支持 `{ layout?: 'sidebar'|'top'|'mix', theme?: {...} }`，实现单页面的布局/主题微调（如大屏页切 top 布局）。

### 5.3 菜单 `meta`（路由元信息）约定

```jsonc
{ "title": "商品管理",        // 导航标题（面包屑/tab）
  "keepAlive": true,           // 页面缓存
  "layout": "sidebar",         // 可选：布局覆写
  "theme": { "primary": "..." }, // 可选：主题覆写
  "crudResource": "products" } // 可选：页面绑定的 CRUD 资源名（通用表格页直接消费）
```

## 6. 前端消费约定（业务逻辑与界面解耦的实现面）

1. **启动流程**：登录 → `GET /admin/bootstrap` 一次拉取 → ① `menus` 树生成动态路由（`path` 为路由、`component` 为组件懒加载标识、`meta` 进 route.meta）→ ② `permissions` 注入按钮级权限指令（`v-perm="'admin:role:create'"`，`*` 直通）→ ③ `ui.theme/ui.layout` 映射 CSS 变量与布局类名。
2. **通用表格页**：路由 meta 携带 `crudResource` → 读取 `/admin/crud/:resource/schema` → 按 `fields` 的 `inList/inFilter/sortable/dictType/type` 渲染列/筛选器/排序，表单按 `inForm/required/type/dictType/options/pattern` 渲染；数据经同名动态端点读写。**同一套渲染器适配任意已注册资源**。
3. **字典联动**：`type: 'dict'` 字段经 `/admin/dicts/:dictType/items` 取选项；提交值由引擎用 `DictService.validateItemValue` 二次校验（前后端同源）。
4. **实时权限**：改绑/改授权后无需重新登录，下一请求即按新权限集鉴权（`@RequirePerm` 端点）；`@Roles` 端点为快照语义（重登生效），前端 bootstrap 中 `user.roles` 用于渲染角色徽标。

## 7. 典型场景替换的适配步骤

> 通用引擎与底座完全不动；一个新场景 = 「建表 → 注册定义 → 声明权限 → 挂菜单 → 配字典/主题」五步。

### 步骤模板（以电商「订单管理」为例）

```bash
# ① 业务侧 Prisma model（业务 prisma/schema.prisma，勿改核心 fragments）
model Order {
  id         String   @id @default(uuid())
  orderNo    String   @unique
  amount     Float
  status     String   @default("pending")
  tenantId   String?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  @@index([status]) @@map("orders")
}
pnpm run db:generate && pnpm run db:push
```

```ts
// ② 实体定义（业务模块文件，如 ecommerce/entities/order.entity.ts）
export const ORDER_ENTITY: CrudEntityDefinition = {
  resource: 'orders', model: 'order', title: '订单',
  permissionPrefix: 'order',
  fields: [
    { key: 'orderNo', label: '订单号', type: 'string', required: true, inFilter: true },
    { key: 'amount', label: '金额', type: 'number', min: 0, sortable: true },
    { key: 'status', label: '状态', type: 'dict', dictType: 'order_status', inFilter: true, defaultValue: 'pending' },
  ],
  hooks: {
    beforeCreate: (data, ctx) => ({ ...data, tenantId: ctx.tenantId }),  // 租户注入
    beforeDelete: async (id) => { /* 关联校验：有发货记录则抛 BizException */ },
  },
};

// ③ 装配注册
AdminModule.forRoot({ crudEntities: [ORDER_ENTITY] })
```

```ts
// ④ 权限点与菜单（种子或管理端 API：POST /admin/rbac/permissions、POST /admin/menus）
//    order:list / order:create / order:update / order:delete  → 授予「电商运营」角色
//    菜单：/ecommerce/orders，permCode: 'order:list'，meta: { crudResource: 'orders' }
// ⑤ 字典与主题：POST /admin/dicts/types { code: 'order_status', ... } + items
//               PUT /admin/configs/ui.theme（品牌主色）/ ui.layout（布局模式）
```

### 三类典型场景的差异矩阵

| 适配项 | 电商后台 | 内容管理（CMS） | 运营后台 |
| --- | --- | --- | --- |
| 实体定义 | orders/products/skus（金额/库存字段、租户注入 hooks） | articles/categories/tags（富文本 text 字段、发布状态字典） | 优惠券/活动/素材（枚举+日期字段、baseWhere 软删过滤） |
| 权限域 | `order:*`、`product:*` | `article:*`、`category:*` | `campaign:*`、`coupon:*` |
| 字典 | order_status、pay_channel、logistics_provider | article_status、content_tag | campaign_type、coupon_type |
| 菜单/主题 | `/ecommerce/*`，品牌色即 ui.theme | `/cms/*`，meta.layout 可按栏目覆写 | `/operations/*`，ui.layout.mode: 'mix' |
| 审计动作 | `crud:orders:create` 等自动产生 | 同左（占位符按资源展开） | 同左 |
| 角色建议 | 电商运营/客服（只读授权） | 编辑/主编（分状态授权） | 运营/审核（按钮级权限 type:button） |

**退役/切换**：从 `crudEntities` 移除定义（或 `registry.unregister('orders')`）→ 端点族与菜单即下线；历史数据与审计记录不受影响。核心 admin 域（用户/角色/菜单/字典/配置/审计）对所有场景通用，无需重复实现。

## 8. 测试与验证

- 单测（16）：`admin.module.spec.ts`（forRoot 装配契约：守卫开关/种子开关/实体注册 fail-fast/UserModule 聚合）、`crud.validator.spec.ts`（校验器：必填/白名单/类型收敛/defaultValue/只读剥离/null 语义/enum/dict）。
- E2E（35，`test/admin.e2e-spec.ts`，真实 SQLite）：bootstrap 聚合与未登录 20001；RBAC 全链路（含 20003/33003/40001 边界）；**实时权限变更**（绑定→立即授权→解绑→立即收回，无需重登）；CRUD 引擎（schema 下发/defaultValue/33402 明细/keyword+inFilter 筛选/排序白名单 10002/33401）；菜单可见性过滤与内置保护；字典读取与冲突；ui 配置更新即时反映到 bootstrap；审计分页通配筛选与动态动作 `crud:products:create` 落库。
- 全量回归：底座原有 33 测试无回归；`pnpm run depcruise` 148 模块 0 违规。
