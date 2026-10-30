process.env.LOG_LEVEL = 'silent';

import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { configureApiBase } from '../src/config/api-base';
import { buildOpenapiDocument } from '../src/config/openapi';

/**
 * 导出 OpenAPI 规范到 openapi.json（npm run openapi:export）。
 * 供前端代码生成（openapi-typescript / orval）、网关导入、接口契约评审使用。
 * 路径形态与 main.ts 完全一致（configureApiBase 保持单一配置点）。
 */
async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false, bodyParser: false });
  configureApiBase(app, process.env.GLOBAL_PREFIX ?? 'api');
  const document = buildOpenapiDocument(app);
  writeFileSync('openapi.json', JSON.stringify(document, null, 2), 'utf8');
  await app.close();
  const paths = Object.keys(document.paths ?? {});
  console.log(`openapi.json 导出完成，共 ${paths.length} 个路径`);
}

void main();
