# api-foundation — NestJS v12 通用接口底座

NestJS 12.3.0 + Express + TypeScript 5.9 的通用后端接口底座：统一响应/错误码、参数校验、JWT 鉴权 + RBAC、结构化日志（requestId 全链路）、分页契约、审计、限流、安全加固、Swagger 文档、自动化测试（Vitest）。

## 运行

包管理器：**pnpm ≥ 10**（锁文件 `pnpm-lock.yaml`；构建脚本白名单见 `pnpm-workspace.yaml` 的 `allowBuilds`）。

```bash
pnpm install
pnpm run dev        # 开发（node --watch + ts-node，pino-pretty 美化输出）
pnpm run build      # 编译到 dist/（tsconfig.build.json，严格模式）
pnpm run prod       # 生产运行（读取 dist/）
pnpm test           # 全部测试（单元 + E2E，Vitest + SWC）
pnpm run test:e2e   # 仅 E2E
pnpm run db:migrate # Prisma 迁移（首次部署执行；dev.db 自动创建）
pnpm run db:generate # Prisma 客户端生成（schema 变更后；pnpm 布局下 postinstall 不自动触发时执行此命令）
pnpm run openapi:export # 导出 openapi.json（前端代码生成/网关导入）
```

> 迁移自 npm：`node_modules` 与 `package-lock.json` 已移除；pnpm 严格布局下曾暴露两个幻影依赖（`ms`、`jsonwebtoken`）并已补为直接依赖。

数据层：**Prisma 6 + SQLite**（零外部依赖，仓储按异步契约实现，可整体切换 PostgreSQL/MySQL 而不动业务代码）。开发环境缺省 `DATABASE_URL=file:./dev.db`；生产环境必须显式提供连接串（启动校验 fail-fast）。角色字段以 JSON 序列化存于 `rolesJson`（SQLite 无标量数组）。

## 架构分层

```
src/
├── main.ts / app.module.ts   # bootstrap 与全局 Provider 注册（Pipe/Guard/Filter/Interceptor）
├── config/                   # 配置加载 + env 启动期校验（fail-fast）
├── common/                   # 横切底座：错误码、BizException、统一响应、分页、守卫、装饰器
├── infra/                    # 框架集成：logger（pino+requestId）、auth（JWT 策略/登录）
├── modules/                  # 业务模块：hello（最小示例）、user（CRUD+分页+RBAC 参考实现）
└── health/                   # 存活探针
```

依赖方向：`modules → common / infra`；`common` 不依赖任何业务模块。底座能力全部经
`APP_PIPE / APP_GUARD / APP_FILTER / APP_INTERCEPTOR` 全局注册，业务代码零侵入。

## API 一览（前缀 /api/v1）

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| POST | /auth/login | 公开 | 登录签发双凭证（限流 5 次/分钟）。内置账号：admin/admin123、ops/ops123456、demo/demo123456 |
| POST | /auth/refresh | 公开 | refreshToken 换取新凭证对（限流 10 次/分钟；refresh 不能访问业务接口） |
| GET  | /auth/profile | 登录 | 当前用户（@CurrentUser 示例） |
| GET  | /users/me | 登录 | 我的信息 |
| GET  | /users | admin | 分页查询（结果缓存 30s，写操作版本号失效） |
| GET/POST/PATCH/DELETE | /users/:id | admin | 用户 CRUD（写操作带审计；POST 支持 Idempotency-Key 幂等重放） |
| GET  | /audit | admin | 最近审计记录（含租户上下文与脱敏入参） |
| GET  | /hello | 登录 | 最小示例（v1） |
| GET  | /hello/error | 登录 | BizException 演示（30000/HTTP 422） |
| GET  | /api/v2/hello | 公开 | URI 版本化 v2 演示（与 v1 并行） |
| GET  | /health | 公开 | 存活探针 |

- Swagger：`http://localhost:3000/docs`（在线调试，右上角 Authorize 填入 token）
- OpenAPI 导出：`npm run openapi:export` → `openapi.json`（供前端代码生成/网关导入）

## 契约要点

- **统一响应**：`{ code, message, data, requestId, timestamp }`；0 = 成功。
- **错误码分段**：10xxx 参数校验、20xxx 认证权限（20001 未认证/20002 过期/20003 无权限）、30xxx 业务、40xxx 资源（40001 不存在/40002 冲突）、50xxx 系统。定义集中于 `src/common/error-codes.ts`。
- **鉴权**：默认全站需登录；`@Public()` 豁免，`@Roles('admin')` 声明角色（任一满足）。
- **分页**：请求 `page/pageSize/sort`，响应 `data = { list, total, page, pageSize, totalPages }`；排序字段白名单防注入（`toQueryOptions`）。
- **requestId**：透传上游 `x-request-id` 或自动生成，写回响应头并注入所有日志行（含 413 等早期错误）。
- **审计**：`@Audit('user:create', { includeBody: true })` 标注写操作；异步记录、敏感字段（password/token/secret）强制脱敏；`GET /audit`（admin）查询。
- **限流**：全局 100 次/分钟/IP（429 → 50003）；登录端点收紧至 5 次/分钟。
- **安全加固**：helmet 安全响应头（开发环境关闭 CSP 以保 Swagger）、请求体 ≤256KB（413 → 10002）、CORS 白名单（生产未配置 `CORS_ORIGINS` 则拒绝跨域）。
- **测试**：Vitest + SWC（`@nestjs/common` 12 为 ESM-only，Jest 不适用）；12 个单测（分页转换/响应构造/异常映射）+ 9 个 E2E（鉴权/RBAC/分页/校验/审计脱敏/兜底，走真实 SQLite）。
- **类型安全**：tsconfig `strict: true` 全量开启（src + test + 配置文件），构建经 `tsconfig.build.json` 仅产出业务代码。
- **缓存**：@nestjs/cache-manager（默认内存/Keyv，生产接入 Redis 仅替换 stores）；分页结果按查询指纹缓存，版本号递增实现批量失效（Keyv 无前缀扫描）。
- **幂等**：`@Idempotent()` 端点支持 Idempotency-Key——重放返回首次结果（`X-Idempotent-Replayed: true`）、在途请求合并、失败不入缓存可重试、TTL 24h。
- **领域事件**：@nestjs/event-emitter 进程内总线（`user.changed`）；跨进程需求按同一事件契约替换为 BullMQ/RabbitMQ。
- **双凭证**：access（2h，typ=access）+ refresh（7d，typ=refresh）；策略层拒绝刷新凭证访问业务接口。
- **版本化**：全局前缀 `api` + URI 版本化（默认 v1），新版本以 `@Controller({ version: '2' })` 并行发布。
- **租户上下文**：X-Tenant-Id（白名单字符校验）经 ALS 贯通日志与审计；数据层隔离策略由业务按需实现。

规划详情见 `docs/api-foundation-plan.md`。
