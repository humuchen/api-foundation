import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import { json, urlencoded } from 'express';
import helmet from 'helmet';

/**
 * HTTP 安全加固（main.ts 在路由注册前调用）：
 *  - helmet 安全响应头（开发环境关闭 CSP，避免 Swagger UI 内联脚本被拦截）
 *  - body 解析显式接管并限制体积（超限 → 413 → 过滤器映射 10002）
 *  - CORS 环境驱动：配置 CORS_ORIGINS 白名单；生产未配置则拒绝跨域
 */
export function applyHttpHardening(app: INestApplication, configService: ConfigService): void {
  const isProd = configService.get<string>('app.env') === 'production';

  app.use(helmet({ contentSecurityPolicy: isProd ? undefined : false }));
  app.use(json({ limit: '256kb' }));
  app.use(urlencoded({ extended: true, limit: '256kb' }));

  const origins = configService.get<string[]>('cors.origins', []);
  app.enableCors({
    origin: origins.length ? origins : isProd ? false : true,
    credentials: true,
  });
}
