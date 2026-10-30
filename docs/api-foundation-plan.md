# 通用后端接口底座 —— 规划与实施状态

> 项目：api-foundation（NestJS 12.3.0 + Express 5 + TypeScript 5.9 strict + Prisma 6 / SQLite）
> 当前版本：v0.4.0 ｜ 初始规划日期：2026-10-30 ｜ 本文更新日期：2026-10-30
> 文档定位：由初始规划文档演进为**当前实现的事实文档**。规划与实际的差异在第四、五节逐项标注，新增能力契约以第三节为准。

---

## 一、现状总览

初始规划的 P0（底座最小闭环）、P1（鉴权与数据层）、P2（治理增强）已**全部落地**；P3 中的幂等、缓存、OpenAPI 导出提前完成。项目已具备生产候选形态。

| 维度 | 现状 | 说明 |
|------|------|------|
| 框架 | NestJS 12.3.0（正式版） | swagger/jwt/passport/throttler 集成包均以 v12 兼容版本锁定 |
| HTTP 平台 | @nestjs/platform-express + express 5.3.0 | **express 已显式声明为直接依赖**（pnpm 严格布局下，直接 import 的包必须声明；与 platform-express 共享同一物理实例） |
| 语言 | TypeScript 5.9.3, CommonJS, ES2021 | **strict: true 已全量开启**（规划中的"渐进收紧"已一步到位） |
| 数据层 | Prisma 6.19 + SQLite（dev.db） | 零外部依赖起步，生产可平滑切换 PostgreSQL/MySQL；User 模型的 roles 以 JSON 字符串存储，仓储层负责映射 |
| 日志 | pino 10 自封装（infra/logger） | 替代规划的 nestjs-pino；Nest 内置 Logger 已桥接至 pino |
| 测试 | vitest 5 + supertest | 替代规划的 jest；3 个底座单测 + 1 个 E2E 冒烟 |
| 部署 | GitHub Actions → GitHub Pages | 文档站自动发布（详见第六节） |

---

## 二、目录结构（实际）

```
src/
├── main.ts                          # bootstrap：pino 初始化 → pino 桥接 Nest Logger → requestId 中间件
│                                    #   → HTTP 加固 → 全局前缀/版本化 → 优雅停机 → Swagger(/docs)
├── app.module.ts                    # 根模块：全局注册（见下方守卫/拦截器链）
│
├── common/                          # ★ 通用底座（纯能力，零业务依赖）
│   ├── constants/metadata.constants.ts      # PUBLIC_KEY、ROLES_KEY、AUDIT_KEY、IDEMPOTENT_KEY
│   ├── decorators/                          # @Public @Roles @CurrentUser @Audit @Idempotent
│   ├── dto/                                 # PaginationDto、IdParamDto
│   ├── exceptions/biz.exception.ts          # BizException（code + message + data）
│   ├── filters/all-exceptions.filter.ts     # 全局异常 → 统一响应
│   ├── guards/                              # jwt-auth.guard（全局默认鉴权）、roles.guard（RBAC）
│   ├── interceptors/                        # logging（耗时）、transform（响应包壳）
│   ├── responses/                           # ApiResponse<T>、PageVo<T>
│   ├── utils/query.util.ts                  # PaginationDto → { skip, take, order }（ORM 中立）
│   └── error-codes.ts                       # ★ 错误码总表（唯一事实来源）
│
├── config/                          # 配置层
│   ├── configuration.ts             # env → 强类型配置（app/auth/cors/throttler…）
│   ├── env.validation.ts            # 启动期校验（零依赖显式校验，fail-fast；可平滑替换 joi/zod）
│   ├── api-base.ts                  # 全局前缀 + URI 版本化（main.ts 与导出脚本共用）
│   ├── http-hardening.ts            # helmet / body 256kb / CORS 环境驱动
│   └── openapi.ts                   # OpenAPI 文档唯一构建点（servers 在此声明）
│
├── infra/                           # 框架集成层（有状态、可替换）
│   ├── logger/                      # pino 封装：requestContext ALS 中间件 + AppLoggerService 桥接
│   ├── auth/                        # 登录/刷新（双凭证模型）、passport-jwt 策略
│   ├── audit/                       # @Audit 埋点 → 异步写入（内存环形 + pino），查询接口 /api/v1/audit
│   ├── idempotency/                 # @Idempotent 幂等拦截器（cache-manager Keyv 存储）
│   └── database/                    # PrismaService / PrismaModule
│
├── modules/                         # ★ 业务模块
│   ├── hello/                       # v1（参数校验/纯文本）+ v2（结构化返回）并行版本演示
│   └── user/                        # 参考 CRUD：分页 + RBAC + 幂等 + 审计 + 事件（user.events）
│
└── health/                          # GET /api/v1/health（@Public 存活探针）
```

**全局注册链（app.module）**：

- APP_PIPE：ValidationPipe（校验失败 → BizException 10001 + 字段明细）
- APP_GUARD：ThrottlerGuard（限流，429 → 50003）→ JwtAuthGuard（@Public 豁免）→ RolesGuard（@Roles 驱动）
- APP_FILTER：AllExceptionsFilter（统一兜底）
- APP_INTERCEPTOR：Logging → Audit → Idempotency → Transform（最后包壳）

---

## 三、底座能力契约（已落地）

### 3.1 统一响应格式

成功/失败由 TransformInterceptor + AllExceptionsFilter 保证，业务代码只返回裸数据：

```jsonc
// 成功（HTTP 200）
{ "code": 0, "message": "ok", "data": {}, "requestId": "f47ac10b-...", "timestamp": 1799000000000 }

// 失败（HTTP 4xx/5xx，body.code 承载业务细分；校验失败时 data 携带字段级明细）
{ "code": 20001, "message": "未登录或凭证无效", "data": null, "requestId": "f47ac10b-...", "timestamp": 1799000000000 }
```

分页响应 `PageVo<T>`：`{ list, total, page, pageSize, totalPages }`。

### 3.2 错误码体系（error-codes.ts 实际登记）

双轨制：HTTP 状态码表达传输层语义，`body.code` 表达业务细分；未登记的脏 code 兜底按 50001 处理。

| code | HTTP | message |
|------|------|---------|
| 0 | 200 | ok |
| 10001 | 400 | 参数校验失败 |
| 10002 | 400 | 请求参数错误 |
| 20001 | 401 | 未登录或凭证无效 |
| 20002 | 401 | 凭证已过期 |
| 20003 | 403 | 无访问权限 |
| 20004 | 403 | 账号已被禁用 |
| 30000 | 422 | 业务处理失败 |
| 40001 | 404 | 资源不存在 |
| 40002 | 409 | 资源状态冲突 |
| 50001 | 500 | 服务器内部错误 |
| 50002 | 502 | 依赖服务不可用 |
| 50003 | 429 | 请求过于频繁 |

约定：新增错误码必须先在 error-codes.ts 登记，业务代码通过 `BizException(code, message?)` 抛出，禁止模块内私造错误码。

### 3.3 参数校验与异常分层

- ValidationPipe 全局注册（whitelist + forbidNonWhitelisted + transform），DTO 装饰器声明规则，控制器零校验代码。
- 异常分层：BizException（业务主动抛出）→ 指定 code；ValidationPipe → 10001 + 明细；HttpException → 映射 40xxx/50xxx；未知异常 → 50001（完整堆栈仅入日志，对外隐藏）。

### 3.4 鉴权与 RBAC

- **双凭证模型**（超出原规划的单轨 JWT）：登录签发 access（默认 2h）+ refresh（默认 7d）凭证对，payload 携带 `typ` 标记防混用；`POST /auth/refresh` 用 refreshToken 换新对（自包含校验，无服务端会话）。
- 密码哈希：bcryptjs。策略：passport-jwt。
- 全局 JwtAuthGuard 默认拒绝，`@Public()` 白名单（/auth/login、/auth/refresh、/api/v1/health、/api/v2/hello、/docs）。
- RBAC 阶段一：`@Roles('admin')` + RolesGuard（user 模块写操作均限 admin）。

### 3.5 日志与审计

- 日志：pino 结构化输出；requestContext 中间件经 AsyncLocalStorage 注入 requestId，与响应体、审计贯通；Nest 内置 Logger 桥接 pino。
- 审计：`@Audit('user:create', { includeBody: true })` → AuditInterceptor 异步落盘（微任务让出，不阻塞响应）；记录 who/when/what/入参摘要/结果/耗时/租户（X-Tenant-Id）；password/token/secret 等键名强制脱敏；提供 `GET /api/v1/audit` 查询。
- 当前审计为**内存环形暂存（500 条）+ pino 输出**，持久化接口契约已定型，待替换为表/消息队列实现。

### 3.6 幂等与缓存（规划 P3，已提前落地）

- `@Idempotent()` 声明端点生效（user:create 已启用）：请求头 `idempotency-key`；首次成功结果缓存 24h，同键重放返回缓存并标注 `x-idempotent-replayed`；同键在途并发合并等待，保证只执行一次；失败不入缓存可重试。
- 存储为进程内 Keyv（@nestjs/cache-manager），跨实例场景接入 Redis 后语义不变。

### 3.7 分页与查询

PaginationDto（page/pageSize/sort 字段白名单防注入/keyword）→ query.util 输出 ORM 中立的 `{ skip, take, order }`。

### 3.8 限流与 HTTP 加固

- ThrottlerGuard 全局限流（超限 429 → 50003），响应头携带 X-RateLimit-*。
- helmet 安全响应头（生产开启 CSP）；body 解析显式接管并限 256kb（超限 → 413 → 10002）。
- CORS 环境驱动：`CORS_ORIGINS` 白名单；开发全放行，**生产未配置则拒绝所有跨域**。

### 3.9 API 形态与版本化

- 全局前缀 `api` + URI 版本化（默认 v1）→ `/api/v1/*`；`/api/v2/hello` 演示并行版本（结构化返回，@Public）。
- 端点清单（12 个路径）：/health、/auth/*（login/refresh/profile）、/users（CRUD+me+分页）、/hello（v1 三端点）、/v2/hello、/audit。

---

## 四、规划 → 实施对照

| 阶段 | 规划任务 | 状态 | 落地说明 |
|------|----------|------|----------|
| P0 | @nestjs/config + env 校验 | ✅ | 零依赖显式校验（比规划的 joi/zod 更轻），fail-fast |
| P0 | 错误码总表 + BizException | ✅ | 13 个错误码已登记，含兜底解析 |
| P0 | 统一响应 + TransformInterceptor | ✅ | 与 PageVo 配套 |
| P0 | AllExceptionsFilter | ✅ | 4xx warn / 5xx error+stack 分级日志 |
| P0 | class-validator 全局管道 | ✅ | HelloQueryDto / PaginationDto / IdParamDto |
| P0 | pino 日志 + requestId | ✅ | 自封装 pino + ALS 中间件（见第五节选型差异） |
| P0 | main.ts 改造 + /health | ✅ | 优雅停机、健康探针 @Public |
| P0 | 目录重构迁移 | ✅ | common/config/infra/modules/health 就位 |
| P1 | AuthModule（JWT + @Public 白名单） | ✅ | 升级为 access + refresh 双凭证模型 |
| P1 | RolesGuard + @Roles | ✅ | 阶段一（角色硬编码） |
| P1 | 数据层 + 分页接入 | ✅ | Prisma + SQLite；user 模块为参考实现 |
| P1 | Swagger 全量文档化 | ✅ | /docs + /docs-json + 装饰器注解 |
| P2 | 审计模块 | ✅ | 含租户字段与脱敏；持久化待替换（见第七节） |
| P2 | 测试体系 | ✅ | vitest + supertest（选型差异见第五节） |
| P2 | 安全加固（throttler/helmet/CORS/body 限制） | ✅ | http-hardening.ts 统一接管 |
| P2 | tsconfig strict + ESLint | ⚠️ 部分 | strict: true 已全量开启；ESLint 未引入 |
| P3 | 幂等键 | ✅ 提前 | @Idempotent + 在途合并（超出规划深度） |
| P3 | 缓存层 | ✅ 部分 | cache-manager 内存态；Redis 接入待做 |
| P3 | OpenAPI 规范导出 | ✅ 提前 | 导出脚本 + GitHub Pages 文档站 |
| P3 | 接口版本化深化 | ✅ | URI 版本化 v1/v2 并行演示 |
| P3 | 消息队列、多租户深化 | ⬜ | 未启动 |

---

## 五、与初始规划的技术选型差异

| 项 | 规划 | 实际 | 原因 |
|----|------|------|------|
| 日志 | nestjs-pino | **自封装 pino**（infra/logger） | 需要与 Nest 内置 Logger 桥接、ALS 注入更可控，避免额外封装层 |
| 测试 | jest + ts-jest | **vitest + @swc/core** | 转译更快、配置更简；unplugin-swc 接入 |
| 密码哈希 | argon2 | **bcryptjs** | 纯 JS 无原生编译依赖，Windows/CI 环境零摩擦 |
| JWT | passport-jwt 单轨 | **@nestjs/jwt + passport-jwt 双凭证** | access/refresh 分离为生产必需，规划阶段考虑不足 |
| 幂等 | P3 待规划 | 已实现 | 底座契约类能力宜早不宜迟 |
| strict 模式 | 渐进收紧 | 一步到位 | 新项目无存量包袱 |
| env 校验 | joi 或 zod | 显式 TS 校验函数 | 规则少时零依赖；ConfigModule validate 挂载点保持可替换 |

---

## 六、文档与发布基础设施

### 6.1 API 文档三通道

1. **应用内 Swagger UI**：`http://localhost:3000/docs`（persistAuthorization）；`/docs-json` 输出原始 OpenAPI。
2. **openapi.json 导出**：`pnpm run openapi:export`（scripts/export-openapi.ts，与 main.ts 共用 api-base/openapi 配置点，防止漂移）。
3. **GitHub Pages 文档站**：`.github/workflows/deploy-docs.yml` 在 push 到 main 时自动部署 `docs/api-docs.html`（首页）+ `openapi.json` → `https://humuchen.github.io/api-foundation/`；`actions/configure-pages` 已启用 `enablement: true`，首次运行自动创建 Pages 站点。

### 6.2 OpenAPI servers 与在线调试

- openapi.ts 声明两个 server：`http://localhost:3000`（本地开发）、`/`（同源部署）。
- **Pages 为静态托管，不承载 API**：在线调试需在 Swagger UI 顶部 Servers 下拉选择 localhost，并本地 `pnpm run dev`；开发环境 CORS 全放行（已实测 Pages 域名跨域可达）。
- 若 API 部署至真实主机：在 openapi.ts 增补 server 地址，并在生产配置 `CORS_ORIGINS` 包含 Pages 域名。

### 6.3 依赖声明约定

pnpm 严格布局下：**源码直接 import 的包必须声明为直接依赖**（如 express），不得依赖提升的传递依赖（幽灵依赖）。

---

## 七、后续演进清单

1. **审计持久化**：替换 AuditService 的 persist 为表写入/消息队列（接口契约已定型）。
2. **幂等 Redis 化**：跨实例/重启语义升级（header 契约不变）。
3. **RBAC 阶段二**：user/role/permission 落库，按 `模块:动作` 粒度校验。
4. **登出与设备管理**：refresh token 黑名单、多端登录策略。
5. **ESLint 引入**：typescript-eslint 接入，对 common/infra 强制规则。
6. **生产就绪检查单**：强随机 JWT_SECRET（缺省 dev 密钥生产启动即失败）、CORS_ORIGINS 显式配置、数据库切换 PostgreSQL、日志聚合接入。
7. **多租户深化**：X-Tenant-Id 已贯通审计，向数据隔离层演进。
