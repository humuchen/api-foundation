import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApiBase } from './config/api-base';
import { buildOpenapiDocument } from './config/openapi';
import { applyHttpHardening } from './config/http-hardening';
import { AppLoggerService, getLogger, initLogger, requestContextMiddleware } from './infra/logger';

async function bootstrap(): Promise<void> {
  // 1. pino 先于 NestFactory 初始化，确保框架内部启动日志统一走 pino
  initLogger();

  // bodyParser: false —— 请求体解析由 http-hardening 显式接管（带体积上限）
  const app = await NestFactory.create(AppModule, { bufferLogs: true, bodyParser: false });

  // 2. Nest 内置 Logger 接入 pino（此后 new Logger() 输出自动结构化并携带 requestId）
  app.useLogger(app.get(AppLoggerService));

  // 3. 请求上下文中间件必须最先注册：body 解析失败（413）等早期错误也需携带 requestId
  app.use(requestContextMiddleware);

  // 4. 安全加固 + 请求体解析（早于所有路由注册）
  const configService = app.get(ConfigService);
  applyHttpHardening(app, configService);

  // 5. API 基础形态：全局前缀 + URI 版本化（/api/v1/*、/api/v2/*）
  const globalPrefix = configService.get<string>('app.globalPrefix', 'api');
  configureApiBase(app, globalPrefix);
  app.enableShutdownHooks(); // SIGTERM/SIGINT 优雅停机

  // 6. API 文档（/docs 为静态资源路径，不受全局守卫影响；/docs-json 输出原始 OpenAPI）
  SwaggerModule.setup('docs', app, buildOpenapiDocument(app), {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = configService.get<number>('app.port', 3000);
  await app.listen(port);

  getLogger().info(
    `NestJS v12.3.0 已启动: http://localhost:${port}/${globalPrefix}/v1（docs: /docs）`,
  );
}

void bootstrap();

