# 通用后端接口底座规划

> 适用项目：api-foundation（原 nestjs-v12-preview；NestJS 12.3.0 + Express + TypeScript 5.9, CommonJS）
> 撰写日期：2026-10-30

---

## 一、现状分析

### 1.1 技术栈盘点

| 维度 | 现状 | 评价 |
|------|------|------|
| 框架 | NestJS 12.3.0（preview 版本） | 较新，第三方生态包（swagger/jwt/passport 集成包）版本兼容性需逐一验证 |
| HTTP 平台 | @nestjs/platform-express | 主流稳定 |
| 语言 | TypeScript 5.9.3, target ES2021, CommonJS | 宽松模式（strictNullChecks=false, noImplicitAny=false），建议渐进收紧 |
| 运行方式 | dev: node --watch + ts-node/transpile-only；prod: tsc 编译 | 合理，保留 |
| 依赖 | 仅 core/common/platform-express/reflect-metadata/rxjs | 零横切能力，底座需补齐依赖 |
| 数据层 | 无 ORM/驱动 | 待选型（P1 阶段） |
| 测试 | 无 | P2 阶段补齐 |

### 1.2 现有代码结构

```
src/
├── main.ts                        # 4 行 bootstrap：硬编码 3000 端口，无全局管道/过滤器/前缀
└── app/
    ├── app.module.ts              # 根模块，空 imports
    ├── controller/
    │   ├── index.ts               # barrel export
    │   └── hello.controller.ts    # GET / 与 GET /hello/world，直接返回 string
    └── services/
        ├── index.ts               # barrel export
        └── hello.service.ts       # 返回拼接字符串
```

### 1.3 关键缺口

1. **无统一响应格式**：接口直接返回裸字符串，与 Nest 默认 404 错误格式不一致。
2. **无错误码体系**：异常处理依赖 Nest 默认输出。
3. **无参数校验**：`@Query('name')` 直接取值，未安装 class-validator/class-transformer。
4. **无鉴权与权限**：无 AuthModule、无守卫。
5. **无日志与审计**：使用 Nest 内置 Logger，无请求链路 ID、无耗时统计、无审计。
6. **无分页/查询能力**：无 PaginationDto。
7. **无配置管理**：端口硬编码，无 @nestjs/config。
8. **无 API 文档、无测试、无优雅停机**。

---

## 二、目标目录结构与模块划分

划分原则：**`common/` 放横切底座（纯能力，零业务），`modules/` 放业务模块，`infra/` 放有状态的框架集成（auth/audit/logger/数据层）**。底座通过全局注册（APP_PIPE / APP_FILTER / APP_GUARD / APP_INTERCEPTOR）对业务零侵入。

```
src/
├── main.ts                          # bootstrap：全局前缀、全局管道/过滤器/拦截器、Swagger、优雅停机
├── app.module.ts                    # 根模块：ConfigModule(global) + 底座模块 + 业务模块聚合
│
├── common/                          # ★ 通用底座（纯库，可被任何模块引用）
│   ├── constants/
│   │   └── metadata.constants.ts    #   metadata key：PUBLIC_KEY、ROLES_KEY、AUDIT_KEY、SKIP_TRANSFORM_KEY
│   ├── decorators/
│   │   ├── public.decorator.ts      #   @Public() —— 跳过鉴权白名单
│   │   ├── roles.decorator.ts       #   @Roles('admin') —— 角色声明
│   │   ├── current-user.decorator.ts#   @CurrentUser() —— 参数装饰器，取 req.user
│   │   └── audit.decorator.ts       #   @Audit('user:create') —— 审计埋点
│   ├── dto/
│   │   ├── pagination.dto.ts        #   PaginationDto：page/pageSize/sort/keyword
│   │   └── id-param.dto.ts          #   IdParamDto（UUID/数字校验）
│   ├── exceptions/
│   │   └── biz.exception.ts         #   BizException：业务异常（携带 code + message + data）
│   ├── filters/
│   │   └── all-exceptions.filter.ts #   全局异常过滤器 → 统一响应格式
│   ├── guards/
│   │   ├── jwt-auth.guard.ts        #   全局 JWT 守卫（@Public 豁免）
│   │   └── roles.guard.ts           #   RBAC 角色守卫（@Roles 驱动）
│   ├── interceptors/
│   │   ├── transform.interceptor.ts #   统一响应包壳 ApiResponse<T>
│   │   ├── logging.interceptor.ts   #   请求耗时统计
│   │   └── audit.interceptor.ts     #   审计落库（异步）
│   ├── responses/
│   │   ├── api-response.ts          #   ApiResponse<T> 类型与 ok()/fail() 工具函数
│   │   └── page.vo.ts               #   PageVo<T>：list/total/page/pageSize/totalPages
│   ├── error-codes.ts               # ★ 错误码总表（分段常量，唯一事实来源）
│   └── utils/
│       └── query.util.ts            #   分页 DTO → { skip, take, order } 转换（与 ORM 解耦）
│
├── config/                          # 配置层
│   ├── configuration.ts             #   env → 强类型配置对象
│   └── env.validation.ts            #   启动时 env schema 校验（缺项 fail-fast）
│
├── infra/                           # 框架集成层（有状态、可替换）
│   ├── logger/
│   │   └── logger.module.ts         #   nestjs-pino：结构化日志 + requestId（ALS）注入
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts       #   POST /auth/login、POST /auth/refresh
│   │   ├── auth.service.ts          #   签发/校验 JWT
│   │   ├── jwt.strategy.ts          #   passport-jwt 策略
│   │   └── rbac.service.ts          #   角色→权限解析（简单场景可内联在 Guard）
│   ├── audit/
│   │   ├── audit.module.ts
│   │   └── audit.service.ts         #   审计写入（表/文件），敏感字段脱敏
│   └── database/                    #   P1 阶段数据层（Prisma/TypeORM 二选一）
│
├── modules/                         # ★ 业务模块（每个模块自包含 controller/dto/service）
│   ├── hello/                       #   现有 hello 能力迁移至此
│   │   ├── hello.controller.ts
│   │   ├── hello.service.ts
│   │   ├── hello.dto.ts
│   │   └── index.ts                 #   保留 barrel export 惯例
│   └── user/                        #   示例：完整 CRUD + 分页 + RBAC 的参考实现
│       ├── user.controller.ts
│       ├── user.service.ts
│       ├── user.dto.ts
│       └── index.ts
│
└── health/
    └── health.controller.ts         #   GET /health（liveness，@Public）
```

模块依赖方向：`modules → common / infra`，`common 不依赖任何业务模块`，禁止反向引用。

---

## 三、六大底座能力设计

### 3.1 统一接口响应格式与错误码体系

**成功/失败统一包壳**（由 TransformInterceptor + AllExceptionsFilter 保证，业务代码只返回 data）：

```jsonc
// 成功（HTTP 200）
{
  "code": 0,                       // 0 = 成功
  "message": "ok",
  "data": { },                     // 业务数据；分页接口此处为 PageVo
  "requestId": "f47ac10b-58cc-...",// 链路 ID，与日志、审计贯通
  "timestamp": 1799000000000
}

// 失败（HTTP 4xx/5xx，code 承载业务细分）
{
  "code": 20001,
  "message": "未登录或凭证已失效",
  "data": null,                    // 校验失败时 data 携带字段级错误明细
  "requestId": "f47ac10b-58cc-...",
  "timestamp": 1799000000000
}
```

**分页响应 PageVo<T>**：

```jsonc
{
  "list": [], "total": 100, "page": 1, "pageSize": 20, "totalPages": 5
}
```

**错误码分段规划**（`common/error-codes.ts` 集中定义，双轨制：HTTP 状态码表达传输层语义，body.code 表达业务细分）：

| 段位 | 含义 | 示例 |
|------|------|------|
| 0 | 成功 | — |
| 10xxx | 参数/校验错误 | 10001 参数校验失败、10002 参数类型错误 |
| 20xxx | 认证与权限 | 20001 未认证、20002 凭证过期、20003 无权限、20004 账号被禁用 |
| 30xxx | 业务规则错误（按模块再分段） | 310xx 用户模块、320xx 订单模块 |
| 40xxx | 资源状态 | 40001 资源不存在、40002 状态冲突 |
| 50xxx | 系统与依赖 | 50001 内部错误、50002 依赖服务不可用、50003 限流 |

设计原则：错误码全局唯一、一处定义（error-codes.ts）、message 与 code 一同声明、预留 i18n 扩展位。

### 3.2 参数校验与异常处理

- **依赖**：`class-validator` + `class-transformer`（Nest 官方主流组合）。
- **全局管道**：`ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`，经 APP_PIPE 注册。DTO 用装饰器声明规则，控制器零校验代码。
- **校验失败处理**：管道异常被 AllExceptionsFilter 捕获，映射为 `10001 + 字段级错误明细`。
- **异常分层**：

| 异常类型 | 来源 | 输出 |
|----------|------|------|
| BizException | 业务代码主动抛出 | 指定 code/message |
| HttpException | Nest 内置（NotFound 等 404） | 映射到 40xxx/50xxx 段 |
| ValidationError | ValidationPipe | 10001 + 明细 |
| Unknown Error | 兜底 | 50001，记录完整堆栈，对外隐藏内部细节 |

- **AllExceptionsFilter** 统一出口：组装响应体、注入 requestId、按级别写日志（4xx warn / 5xx error+stack）。

### 3.3 鉴权与权限控制

- **认证**：AuthModule 提供 `POST /auth/login`（argon2/bcrypt 验密 → 签发 JWT）；passport-jwt 策略解析 Bearer Token。
- **全局守卫**：`JwtAuthGuard` 经 APP_GUARD 全局注册，默认全站需登录；`@Public()` 装饰器声明白名单（/auth/login、/health、Swagger）。
- **权限（RBAC 两级演进）**：
  - 阶段一：`@Roles('admin','ops')` + RolesGuard，角色硬编码在装饰器，满足简单场景；
  - 阶段二：user/role/permission 三表落库，rbac.service 解析权限点，Guard 按 `模块:动作` 粒度校验。
- **配置安全**：JWT_SECRET/过期时间全部走 env 校验；预留 refresh token 与多端登录策略扩展点。

### 3.4 日志与审计

- **日志**：`nestjs-pino`（结构化 JSON、低开销），替换默认 Logger；`LOG_LEVEL` 环境变量控制。
- **requestId 贯通**：入口中间件生成/透传 `x-request-id`，经 AsyncLocalStorage 注入所有日志行与响应体，实现一次请求全链路可查。
- **访问日志**：LoggingInterceptor 记录 method/url/status/耗时/userId。
- **审计**：`@Audit('user:create')` 标注敏感写操作 → AuditInterceptor 异步落库（不阻塞响应）；记录 who/when/what/入参摘要/result；password/token 等字段强制脱敏。

### 3.5 通用分页与查询

- **PaginationDto**：page（默认 1，≥1）、pageSize（默认 20，上限 100）、sort（`field:asc|desc` 格式，字段白名单校验防注入）、keyword。
- **query.util.ts**：`toQueryOptions(dto)` 输出 `{ skip, take, order }` 中立结构，不绑定具体 ORM，未来切数据层不改业务代码。
- 分页字段级校验与全站校验共用 3.2 的管道体系。

### 3.6 配置管理（支撑项）

- `@nestjs/config` + `env.validation.ts`（Joi/zod schema），启动即校验必填项，缺失 fail-fast。
- 端口、前缀、JWT、日志级别、数据库连接全部环境变量化，main.ts 消除硬编码。

---

## 四、与现有代码的衔接方式

| 现有资产 | 衔接策略 | 改动量 |
|----------|----------|--------|
| `main.ts` | 渐进追加：`setGlobalPrefix('api/v1')`、注册全局 Pipe/Filter/Interceptor、`enableShutdownHooks()`、Swagger 初始化。现有两行创建/监听逻辑不变，端口改由 ConfigService 读取 | 追加式修改 |
| `app/app.module.ts` | imports 追加 ConfigModule/LoggerModule/AuthModule；providers 追加 APP_PIPE/APP_FILTER/APP_GUARD×2/APP_INTERCEPTOR×3 全局注册 | 追加式修改 |
| `app/controller/`、`app/services/` | **整体迁移**至 `modules/hello/`（controller/service 单数命名对齐 Nest 惯例），保留 index.ts barrel 惯例；`app/` 目录随后收敛为根模块所在 | 目录迁移 |
| HelloController 返回裸 string | **业务代码不改**：service 继续返回数据，由全局 TransformInterceptor 统一包壳。若 `/` 与 `/hello/world` 已被外部调用方依赖，可在根路径临时保留一个兼容 Controller，新接口一律挂 `/api/v1` | 零改动/低改动 |
| HelloService | 原样迁移；P1 阶段作为参数校验+分页的演示改造对象（接收 HelloQueryDto） | 零改动起步 |
| `package.json` scripts | 保留现有四条脚本；新增 `test`（P2 阶段） | 追加 |
| `tsconfig.json` | P0 不动（避免 preview 环境噪音）；P2 随 ESLint 一起渐进开启 strictNullChecks/noImplicitAny，先对新目录生效 | 延后 |

**兼容性红线**：底座全部通过 Nest 标准扩展点（全局 Provider + 装饰器元数据）接入，不修改 Nest 源行为；任何业务模块移除后底座仍可独立运行。

---

## 五、分阶段实施计划与优先级

### P0 —— 底座最小闭环（优先级最高，建议先做）

| # | 任务 | 产出物 |
|---|------|--------|
| 1 | 引入 @nestjs/config + env 校验 | config/ 目录，端口/环境配置化 |
| 2 | 错误码总表 + BizException | common/error-codes.ts、common/exceptions/ |
| 3 | 统一响应类型 + TransformInterceptor | common/responses/、common/interceptors/ |
| 4 | AllExceptionsFilter | common/filters/ |
| 5 | class-validator 全局管道 | 安装依赖，HelloQueryDto 校验示例 |
| 6 | nestjs-pino + requestId | infra/logger/ |
| 7 | main.ts 改造 + /health | 全局前缀、优雅停机、健康检查 |
| 8 | 目录重构迁移 | common/、infra/、modules/hello/ 就位 |

验收标准：任意接口返回统一格式；校验失败返回 10001+明细；日志含 requestId；404/未知异常有兜底格式。

### P1 —— 鉴权与数据层（第二优先级）

1. AuthModule：登录签发 JWT、passport-jwt 策略、JwtAuthGuard 全局 + @Public 白名单；
2. RolesGuard + @Roles（RBAC 阶段一）；
3. 数据层选型落地（建议 Prisma：类型安全与迁移体验好；重定制 SQL 场景选 TypeORM）+ PaginationDto + query.util 接入；
4. Swagger（@nestjs/swagger）全量文档化，标记鉴权注解。

验收标准：未登录访问返回 20001；user 模块 CRUD+分页为业务模块参考实现；Swagger 可在线调试。

### P2 —— 治理增强（第三优先级）

1. 审计模块（@Audit 装饰器 + 异步落库 + 脱敏）；
2. 测试体系（jest + supertest）：底座单测（错误码映射、分页转换）+ E2E 冒烟；
3. 安全加固：@nestjs/throttler 限流、helmet、CORS 白名单收敛、body 大小限制；
4. tsconfig strict 渐进开启 + ESLint 规则（对 common/infra 先行强制）。

### P3 —— 按需演进（第四优先级）

接口版本化策略深化、幂等键、多租户、缓存层（@nestjs/cache-manager + Redis）、消息队列、OpenAPI 规范导出与前端代码生成。

### 优先级判断依据

- **P0 先行**：响应格式与错误码是所有模块的契约基础，越晚定越难改，且不依赖任何外部设施，当天可闭环；
- **鉴权（P1）居次**：接口一旦对外暴露即需鉴权，但依赖 P0 的错误码与响应格式；
- **审计/测试（P2）靠后**：依赖鉴权产生的用户上下文才有审计主体；测试在底座 API 稳定后投入收益最高；
- 数据层放 P1 而非 P0：分页工具可用内存数据先验证契约，避免底座被 ORM 选型阻塞。

---

## 六、新增依赖清单（建议版本以 npm 实际兼容 NestJS 12 为准）

| 类别 | 包 |
|------|-----|
| P0 | @nestjs/config、class-validator、class-transformer、nestjs-pino、pino、pino-pretty（dev） |
| P1 | @nestjs/jwt、passport、passport-jwt、@nestjs/swagger、argon2、@nestjs/prisma 或 @nestjs/typeorm（选型后定） |
| P2 | @nestjs/throttler、helmet、jest、ts-jest、@nestjs/testing、supertest、@types/passport-jwt |
| 可选 | joi 或 zod（env 校验）、eslint + typescript-eslint |

## 七、风险与注意事项

1. **NestJS 12 为 preview 版本**：@nestjs/swagger、@nestjs/jwt、nestjs-pino 等集成包需验证 peer 兼容；安装后先跑通 P0 冒烟再扩展。
2. **全局注册顺序**：Interceptor 执行顺序为注册的逆序，需保证 TransformInterceptor 最后包壳、LoggingInterceptor 最先计时；Guard 顺序 JwtAuthGuard → RolesGuard。
3. **@Public 白名单收敛**：全局守卫默认拒绝，白名单需评审，防止 Swagger/health 之外的接口漏配鉴权。
4. **严格模式迁移**：strictNullChecks 开启预计暴露存量代码类型问题，按目录分批（common → infra → modules）推进。
5. **审计性能**：审计写入必须异步（队列或微任务），避免拖慢接口 P99。
