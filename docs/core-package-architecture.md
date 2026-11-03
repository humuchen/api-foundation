# 核心包架构方案：api-foundation 库化为 pnpm 私有底座包

> 状态：**P1-P4 已落地（2026-11-03）** ｜ 范围：核心包抽取、版本管理与发布、业务接入与升级、依赖关系与扩展机制
> 前置：当前仓库为 NestJS 12 + ESM + pnpm 的可运行应用（`src/main.ts` + `app.module.ts`）

## 1. 目标与设计原则

**目标**

1. 通用核心能力（统一响应/错误码、JWT 鉴权 + RBAC、审计、幂等、分页、缓存、requestId 日志、限流、安全加固）收敛为独立核心包，独立仓库、独立版本、独立发布。
2. 业务项目以 pnpm 依赖方式引入核心包，仓库内只保留业务模块与个性化装配代码。
3. 核心升级可灰度（beta 通道）、可回滚（lockfile + semver）、影响面可评估（CHANGELOG + 契约测试）。

**设计原则**

- **核心是库，不是应用**：不持有最终形态的 `main.ts`；启动装配以 `bootstrap()` 工厂 + `FoundationModule.forRoot()` 暴露。
- **依赖单向**：业务 → 核心；核心零业务感知（import 层面禁止反向引用）。
- **契约先行**：核心对外暴露的一切（响应结构、错误码数值、装饰器语义、SPI 接口签名）都是公共 API，受 semver 保护；`exports` 字段封死未导出路径。
- **扩展点优先于修改点**：业务定制按「配置 → DI 替换 → 事件 → 装饰器」顺序解决，禁止 fork 后漂移。

## 2. 总体架构：多仓 + 私有 Registry（推荐）

```
核心包仓库 api-foundation ──CI(lint/test/build)──▶ Changesets Version PR ──合并──▶ publish
                                                                                    │
业务项目 A/B/C ◀── pnpm add @humuchen/foundation@^1 ──── 私有 Registry（@humuchen scope）◀──┘
```

**选型对比**

| 维度      | 多仓 + 私有源（推荐）          | pnpm monorepo                  |
| --------- | ------------------------------ | ------------------------------ |
| 适用团队  | 跨团队、业务项目形态多样       | 同一团队、核心与业务高频共演   |
| 版本边界  | 强制 semver，升级显式评审      | `workspace:*` 直连，边界易模糊 |
| 仓库权限  | 按仓库粒度隔离                 | 单仓粗粒度                     |
| CI 影响面 | 按仓库触发                     | 全仓触发需调优                 |
| 改造成本  | 就地库化即可（当前已是独立仓） | 需新建聚合仓并迁移             |

**结论**：当前 `api-foundation` 已是独立仓库且具备 CI，最小改造路径即「就地库化 + 私有源发布」。团队规模小、核心与某一业务强共演时，可另建 monorepo 聚合仓，两者不互斥（monorepo 内同样可 `changeset publish` 到私有源）。

## 3. 核心包设计

### 3.1 从应用改造为库

关键动作：

1. `src/` 转为纯库，删除 `main.ts` / `app.module.ts` 的最终形态职责。
2. 新增 `apps/demo/` 宿主应用：保留一个最小 `main.ts` + `AppModule`，职责是 **e2e 集成测试宿主 + 本地体验入口**（现有 18 个 E2E 继续在此跑）。
3. 装配入口收敛为两个 API：

```ts
// 核心包 src/index.ts 导出
export declare function bootstrap(
  AppModule: Type<any>,
  options?: FoundationBootstrapOptions
): Promise<INestApplication>; // 内部完成全局 Pipe/Guard/Filter/Interceptor、helmet、Swagger、前缀与版本化装配

export declare class FoundationModule {
  static forRoot(options?: FoundationOptions): DynamicModule;
}
```

```ts
// 业务项目 src/app.module.ts
import { FoundationModule, AUDIT_SINK } from '@humuchen/foundation';

@Module({
  imports: [
    FoundationModule.forRoot({
      config: { cache: { store: 'redis', redisUrl: process.env.REDIS_URL } },
      replacements: [{ token: AUDIT_SINK, useClass: PgAuditSink }]
    }),
    OrderModule // 纯业务模块
  ]
})
export class AppModule {}

// 业务项目 src/main.ts —— 只剩两行
import { bootstrap } from '@humuchen/foundation';
await bootstrap(AppModule);
```

### 3.2 目录结构与子路径导出

```
api-foundation/                        # 包名：@humuchen/foundation（scope 占位，按组织替换）
├── src/
│   ├── index.ts                       # 根出口：bootstrap、FoundationModule、公共类型
│   ├── factory/                       # bootstrap 工厂（全局组件装配）
│   ├── common/                        # 横切底座：错误码、BizException、统一响应、分页、装饰器
│   ├── infra/                         # 框架集成：logger / auth / cache / audit 默认实现
│   ├── contracts/                     # SPI 契约：DI Token + 接口定义（扩展点唯一入口）
│   ├── health/
│   └── modules/user/                  # 参考实现：可选启用，独立子路径导出
├── apps/demo/                         # 宿主应用：e2e 测试 + 本地调试
├── prisma/                            # schema 片段 + 随包 SQL 迁移（见 3.4）
├── .changeset/                        # 变更记录
└── package.json
```

`package.json` 关键字段：

```jsonc
{
  "name": "@humuchen/foundation",
  "version": "1.0.0",
  "type": "module",
  "files": ["dist"],
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./common": {
      "types": "./dist/common/index.d.ts",
      "import": "./dist/common/index.js"
    },
    "./contracts": {
      "types": "./dist/contracts/index.d.ts",
      "import": "./dist/contracts/index.js"
    },
    "./modules/user": {
      "types": "./dist/modules/user/index.d.ts",
      "import": "./dist/modules/user/index.js"
    }
  },
  "peerDependencies": {
    "@nestjs/common": "^12.0.0",
    "@nestjs/core": "^12.0.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.2"
  },
  "dependencies": {
    "pino": "^10.4.0",
    "bcryptjs": "^3.0.3",
    "@keyv/redis": "^6.1.0"
  },
  "publishConfig": { "registry": "https://registry.example.com/" }
}
```

导出原则：`/common`、`/contracts` 面向业务；`/infra` 为内部实现默认不导出（逼业务走 SPI 而非 deep-import）；`exports` 字段使未列出的路径物理不可达，替代口头约定。

### 3.3 依赖声明：peer 与 direct 的分界

| 类别        | 依赖                                                         | 声明方式             | 理由                                                                                            |
| ----------- | ------------------------------------------------------------ | -------------------- | ----------------------------------------------------------------------------------------------- |
| 框架内核    | `@nestjs/common`、`@nestjs/core`、`rxjs`、`reflect-metadata` | **peerDependencies** | Nest DI 按 Token 同一性解析，装饰器元数据存于全局注册表；出现重复实例会导致注入失败与元数据丢失 |
| Nest 子集成 | `@nestjs/jwt`、`@nestjs/config`、`@nestjs/throttler` 等      | dependencies         | 自身只依赖框架内核 peer，pnpm 会按 range 去重                                                   |
| 纯工具库    | `pino`、`bcryptjs`、`@keyv/redis`、`class-validator` 等      | dependencies         | 与 DI 实例同一性无关，由核心包锁定版本                                                          |
| 构建工具    | `@swc/*`、`typescript`、vitest                               | devDependencies      | 随包不发布                                                                                      |

pnpm 严格隔离在此是红利：业务项目只能 import 自己声明过的依赖，核心包的内部依赖不会泄漏成幻影依赖。

### 3.4 数据层边界（Prisma）

核心包只拥有少量表（`audit_logs`；启用 user 参考实现时含 `users`）。两个方案：

- **方案 A（推荐）—— schema 片段 + 顺序化 SQL 迁移随包发布**：核心包发布 `prisma/foundation/` 片段与 `migrations/foundation/0001_*.sql`，业务项目在自己的迁移流程中按序执行（目录名带核心版本号，幂等可重放）。单库单 client，部署最简。
- **方案 B —— 核心内置独立 PrismaClient**：generated client 随包分发到 `node_modules`，与业务客户端同进程并存（Prisma 支持）。隔离彻底，但双 client、双迁移链路，运维成本高，仅在业务表与核心表必须分库时选。

默认仓储实现（`AuditSink` 等）同时以 SPI 接口暴露，业务可用 DI 替换为任意存储，不绑死 Prisma。

## 4. 版本管理与发布流程

### 4.1 Semver 语义约定

| 变更内容                                                                     | 级别      | 示例                                     |
| ---------------------------------------------------------------------------- | --------- | ---------------------------------------- |
| 统一响应结构、错误码数值/语义、`forRoot` 选项删除或必填化、peer 最低版本提升 | **MAJOR** | 错误码 20001 语义变更；`@Audit` 签名变更 |
| 新增能力、新增 SPI 接口、新增可选 `forRoot` 选项、新增子路径导出             | **MINOR** | 新增 `@Idempotent`；新增事件类型         |
| 缺陷修复、文档、内部实现优化（无契约变化）                                   | **PATCH** | 修复分页排序白名单旁路                   |

判据一句话：**业务项目不改一行代码升级后行为是否可能变化**——可能变化即 MAJOR。

### 4.2 Changesets 工作流

```bash
# 开发者在特性 PR 中附带变更描述（PR 模板强制项）
pnpm changeset          # 选择 bump 级别 + 撰写变更说明 → 生成 .changeset/*.md

# 维护侧：合并 main 后 CI 汇总所有 changeset 生成 Version PR（聚合版本号 + CHANGELOG）
# 批准合并 Version PR → CI 自动执行发布
pnpm changeset version
pnpm changeset publish --tag latest
git push --follow-tags
```

CI（GitHub Actions）发布 job 骨架：`lint → test(单测+E2E) → build → changeset publish`；`NPM_TOKEN` 以 secret 注入，仅 `main` 分支的 Version PR 合并触发。

### 4.3 私有 Registry 选型

| 方案                | 特点                                      | 适用                   |
| ------------------- | ----------------------------------------- | ---------------------- |
| Verdaccio（自建）   | docker 一行起服，全功能私服，可配上游代理 | 有运维能力、需内网隔离 |
| 云效/阿里云制品仓库 | 托管免运维、权限体系完善                  | 国内团队首选托管方案   |
| GitHub Packages     | 与现有 CI 同生态，`GITHUB_TOKEN` 即凭证   | 已重度使用 GitHub      |

业务项目 `.npmrc`：

```ini
@humuchen:registry=https://registry.example.com/
//registry.example.com/:_authToken=${NPM_TOKEN}
always-auth=true
```

发布端在核心包 `publishConfig.registry` 固化私源地址，避免误发公网 npm。

### 4.4 预发布通道与回滚

- `pnpm changeset pre enter beta` 进入预发布模式，发布 `1.3.0-beta.x`（`--tag beta`）；业务项目用 `pnpm add @humuchen/foundation@beta` 试点验证，稳定后退出 pre 模式发正式版。
- **同版本号禁止重发**（私服同样关闭 republish）；问题版本用 `pnpm deprecate` 标记 + PATCH 修复。
- 每次发布打 git tag（`v1.3.0`），tag 与 dist 产物一一对应，必要时可从 tag 复现构建。

## 5. 业务项目接入与升级

### 5.1 初始化接入（五步）

1. 配置 `.npmrc`（见 4.3）→ 2. `pnpm add @humuchen/foundation @nestjs/common @nestjs/core reflect-metadata rxjs`（peer 需业务自装）→ 3. `AppModule` 引入 `FoundationModule.forRoot({...})` → 4. `main.ts` 换为 `bootstrap(AppModule)` → 5. 按 3.4 执行核心表迁移，跑通 `/health` 与 `/auth/login` 即接入完成。

### 5.2 版本策略与升级流程

- 依赖声明 `^1.2.0`，**lockfile 必须提交**——实际生效版本由 `pnpm-lock.yaml` 钉死，升级永远是显式 PR。
- 升级四步：读 CHANGELOG（MAJOR 必读迁移指南）→ `pnpm up @humuchen/foundation@^1.3.0` → CI 跑契约校验（核心随包发布的 `openapi.json` 与业务 e2e 回归）→ 合并。
- 节奏建议：跟随 MINOR/PATCH 月度例行升级；MAJOR 按需评估，核心包为每个 MAJOR 维护迁移文档（必要时提供 codemod）。

### 5.3 本地联调（核心改动即时看效果）

| 方式                             | 用法                                                                                                 | 优点                                 | 局限                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------- |
| `pnpm.overrides` + `link:`       | 业务仓 package.json：`"pnpm": { "overrides": { "@humuchen/foundation": "link:../api-foundation" } }` | 零发布、改完 build 即生效            | 需先构建核心；建议联调分支临时提交，合回前移除 |
| yalc                             | 核心 `yalc publish` → 业务 `yalc add @humuchen/foundation`                                           | 接近真实安装产物                     | 多一步工具链                                   |
| Verdaccio 本地源 / beta dist-tag | 核心 `pnpm publish --tag beta` → 业务 `pnpm up @humuchen/foundation@beta`                            | 全链路最真实，验证的就是发布产物本身 | 需维护本地 registry 或走远端 beta              |

推荐组合：日常调试用 `link:`，联调回归与发布前验证用 beta 通道——保证「调试方便」与「装到的就是发布的」两个诉求都覆盖。

## 6. 依赖关系与扩展机制

### 6.1 依赖方向与防腐化

- **单向依赖**：业务 → 核心。核心仓库 CI 用 dependency-cruiser（或 eslint-plugin-boundaries）静态校验「src 不得引用任何外部业务包」，违规即红灯。
- **物理封边**：`exports` 字段使 `@humuchen/foundation/infra/...` 等内部路径无法 deep-import。
- **版本对齐**：框架 peer 由业务单实例持有；若业务传递引入多版本 Nest，用 pnpm `overrides` 强制收敛到单一版本。

### 6.2 五层扩展机制（由轻到重）

| 层  | 机制       | 业务写什么                                                | 核心提供什么                 |
| --- | ---------- | --------------------------------------------------------- | ---------------------------- |
| L1  | 配置       | `forRoot({ config })` 覆盖缓存/限流/审计参数              | 类型化选项 + env 启动校验    |
| L2  | DI 替换    | `replacements: [{ token: AUDIT_SINK, useClass: MySink }]` | `contracts/` 中 Token + 接口 |
| L3  | 事件订阅   | `@OnEvent('user.changed')` 旁路响应                       | 进程内事件总线与事件契约     |
| L4  | 装饰器组合 | `@Public()` / `@Roles()` / `@Audit()` / `@Idempotent()`   | 端点级行为开关               |
| L5  | 回馈核心   | 需求普适时提 feature PR                                   | RFC 评审 + feature flag 灰度 |

SPI 契约示例：

```ts
// 核心 src/contracts/audit-sink.ts
export const AUDIT_SINK = Symbol('AUDIT_SINK');
export interface AuditSink {
  record(entry: AuditEntry): Promise<void>;
}
// 核心默认实现绑定该 Token；业务经 replacements 整体换实现，核心其余逻辑零改动
```

判定顺序：改参数 → L1；换实现 → L2；旁路响应 → L3；端点开关 → L4；都不满足且需求跨项目普适 → L5。

### 6.3 「什么进核心」的判定准则

同时满足三条才进核心：**跨 ≥2 个业务项目复用、与具体业务语义无关、有测试覆盖**。个性化需求一律留在业务层，经 SPI 挂载；避免核心膨胀成「第二业务仓库」。

### 6.4 兼容性承诺（核心包 README 固化）

Node ≥ 22 LTS ｜ NestJS 12.x（peer `^12.0.0`）｜ Prisma 6.x ｜ pnpm ≥ 10 ｜ 原生 ESM（NodeNext）。

## 7. 落地路线

| 阶段            | 内容                                                             | 产出                                                                                        | 状态                          |
| --------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------- |
| P1 就地库化     | `src/` 转纯库、demo 宿主迁移、exports/peer/changesets 配置       | 核心包 1.0.0，`apps/demo` e2e 全绿（33 测试）                                               | ✅ 完成                       |
| P2 私有源与首版 | Registry 就绪、CI 发布流水线、发布 1.0.0 并打 tag                | release.yml（registry/token 占位待填）；Verdaccio 本地冒烟发布 1.0.0 验证通过               | ✅ 流水线就绪，正式私源待配置 |
| P3 业务试点     | 第一个业务项目接入，按反馈打磨 SPI 与文档                        | `../foundation-trial`：私服安装 → tsc 类型检查 → L1 端口覆盖 + L2 审计替换 → 真实启动全通过 | ✅ 完成                       |
| P4 治理与规模化 | 业务脚手架模板（create-biz-app）、兼容性矩阵自动化检查、依赖看板 | `pnpm create:biz-app` 脚手架端到端验证通过；dependency-cruiser 防腐校验接入 CI；engines(node>=22)+engine-strict；prisma 片段随包发布 | ✅ 完成                       |
