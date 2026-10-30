/**
 * 启动期环境变量校验（fail-fast）。
 * 当前采用零依赖显式校验；规则增多后可平滑替换为 joi/zod schema 方案，
 * ConfigModule.forRoot 的 validate 挂载点保持不变。
 */
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
const NODE_ENVS = ['development', 'test', 'production'] as const;

type EnvRecord = Record<string, unknown>;

const DEV_DEFAULT_JWT_SECRET = 'dev-only-secret-change-me';

export function validateEnv(config: EnvRecord): EnvRecord {
  const errors: string[] = [];

  // NODE_ENV 宽松处理：未知值不阻断启动，configuration() 侧按原值透出
  const nodeEnv = String(config.NODE_ENV ?? 'development');
  if (!(NODE_ENVS as readonly string[]).includes(nodeEnv)) {
    errors.push(`NODE_ENV 无效：${nodeEnv}（可选：${NODE_ENVS.join('/')}）`);
  }

  const port = Number(config.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push(`PORT 无效：${String(config.PORT)}（须为 1-65535 的整数）`);
  }

  const logLevel = String(config.LOG_LEVEL ?? 'info');
  if (!(LOG_LEVELS as readonly string[]).includes(logLevel)) {
    errors.push(`LOG_LEVEL 无效：${logLevel}（可选：${LOG_LEVELS.join('/')}）`);
  }

  // JWT 密钥：生产环境必须显式提供强随机密钥，禁止缺省/示例值（fail-fast）
  const rawSecret = typeof config.JWT_SECRET === 'string' ? config.JWT_SECRET.trim() : '';
  if (nodeEnv === 'production' && (!rawSecret || rawSecret === DEV_DEFAULT_JWT_SECRET)) {
    errors.push('生产环境必须通过 JWT_SECRET 提供显式强随机密钥（禁止缺省或开发默认值）');
  }

  // 数据库：生产环境必须显式提供连接串（开发环境缺省回退 SQLite dev.db）
  const dbUrl = typeof config.DATABASE_URL === 'string' ? config.DATABASE_URL.trim() : '';
  if (nodeEnv === 'production' && !dbUrl) {
    errors.push('生产环境必须通过 DATABASE_URL 提供数据库连接串');
  }

  if (errors.length > 0) {
    throw new Error(`环境变量校验失败，进程终止：\n  - ${errors.join('\n  - ')}`);
  }

  return {
    ...config,
    NODE_ENV: nodeEnv,
    PORT: port,
    LOG_LEVEL: logLevel,
    JWT_SECRET: rawSecret || DEV_DEFAULT_JWT_SECRET,
  };
}
