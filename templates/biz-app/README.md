# **NAME**

基于 `@humuchen/foundation` 底座的业务服务（由 create-biz-app 生成）。

## 启动

```bash
pnpm install
pnpm exec prisma generate && pnpm exec prisma db push
pnpm build && pnpm start    # 探针 /api/v1/health；Swagger /docs
```

## 扩展点速查

| 层         | 机制                                                     | 位置              |
| ---------- | -------------------------------------------------------- | ----------------- |
| L1 配置    | `FoundationModule.forRoot({ config })`                   | src/app.module.ts |
| L2 DI 替换 | `replacements: [{ provide: AUDIT_SINK, useClass: ... }]` | src/extensions/   |
| L3 事件    | `@OnEvent('user.changed')`                               | 业务模块          |
| L4 装饰器  | `@Public()` `@Roles()` `@Audit()` `@Idempotent()`        | 控制器            |

升级核心包：`pnpm up @humuchen/foundation`（读 CHANGELOG → e2e 回归 → 合并）。
核心表结构随包发布于 `node_modules/@humuchen/foundation/prisma/fragments/foundation.prisma`，
升级后同步复制到本仓 `prisma/` 目录。
