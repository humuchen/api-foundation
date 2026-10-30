/**
 * 应用配置：env → 结构化配置对象。
 * 经 ConfigModule.forRoot({ load: [configuration] }) 注册，访问方式：
 *   configService.get<number>('app.port')
 * 必填/合法项由 env.validation.ts 在启动期统一校验（fail-fast）。
 */
export default () => ({
  app: {
    env: process.env.NODE_ENV ?? 'development',
    port: Number(process.env.PORT ?? 3000),
    // 仅到 'api'：URI 版本化在其后追加 /v1 /v2（见 config/api-base.ts）
    globalPrefix: process.env.GLOBAL_PREFIX ?? 'api',
  },
  log: {
    level: process.env.LOG_LEVEL ?? 'info',
  },
  auth: {
    // 生产环境由 env.validation 强制要求显式 JWT_SECRET（缺省值仅限开发）
    jwtSecret: process.env.JWT_SECRET ?? 'dev-only-secret-change-me',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '2h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  cors: {
    // 逗号分隔白名单；生产环境未配置时 CORS 直接拒绝（见 http-hardening）
    origins: process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
      : [],
  },
});
