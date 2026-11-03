import 'reflect-metadata';
import type { INestApplication, Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { configureApiBase } from '../config/api-base.js';
import { buildOpenapiDocument } from '../config/openapi.js';
import { applyHttpHardening } from '../config/http-hardening.js';
import { AppLoggerService, getLogger, initLogger, requestContextMiddleware } from '../infra/logger/index.js';
import type { FoundationBootstrapOptions } from './foundation.types.js';

/**
 * 底座启动工厂：装配序与原 main.ts 完全一致——
 * pino 先行 → NestFactory（bodyParser 关闭，由 http-hardening 显式接管）→ Nest Logger 接入 pino
 * → requestId 中间件 → 安全加固 → 全局前缀 + URI 版本化 → Swagger → 优雅停机 → 监听。
 *
 * AppModule 由调用方组装（FoundationModule.forRoot + 业务模块），本工厂不感知业务模块集合。
 * 返回应用实例，便于 e2e（supertest 直连）与脚本复用。
 */
export async function bootstrap(
  AppModule: Type<object>,
  options: FoundationBootstrapOptions = {},
): Promise<INestApplication> {
  // 1. pino 先于 NestFactory 初始化，确保框架内部启动日志统一走 pino
  initLogger();

  const app = await NestFactory.create(AppModule, { bufferLogs: true, bodyParser: false });

  // 2. Nest 内置 Logger 接入 pino（此后 new Logger() 输出自动结构化并携带 requestId）
  app.useLogger(app.get(AppLoggerService));

  // 3. 请求上下文中间件必须最先注册：body 解析失败（413）等早期错误也需携带 requestId
  app.use(requestContextMiddleware);

  // 4. 安全加固 + 请求体解析（早于所有路由注册）
  const configService = app.get(ConfigService);
  applyHttpHardening(app, configService);

  // 5. API 基础形态：全局前缀 + URI 版本化（/api/v1/*、/api/v2/*）
  const globalPrefix = options.globalPrefix ?? configService.get<string>('app.globalPrefix', 'api');
  configureApiBase(app, globalPrefix);
  app.enableShutdownHooks(); // SIGTERM/SIGINT 优雅停机

  // 6. API 文档（/docs 为静态资源路径，不受全局守卫影响；/docs-json 输出原始 OpenAPI）
  if (options.swagger !== false) {
    SwaggerModule.setup('docs', app, buildOpenapiDocument(app), {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  const port = options.port ?? configService.get<number>('app.port', 3000);
  await app.listen(port);

  getLogger().info(
    `NestJS v12.3.0 已启动: http://localhost:${port}/${globalPrefix}/v1（docs: /docs）`,
  );
  return app;
}
