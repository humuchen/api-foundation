process.env.LOG_LEVEL = 'silent';

import 'reflect-metadata';
import { expect } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApiBase } from '../src/config/api-base.js';
import { requestContextMiddleware } from '../src/infra/logger/index.js';
import type { LoginResult } from '../src/infra/auth/auth.types.js';

/**
 * E2E 共享基建：独立应用实例（不占端口，supertest 直连）、登录封装、异步落库轮询。
 * 注意：各 spec 文件串行执行（vitest fileParallelism: false，SQLite 单写者）。
 */

/** 创建与生产形态一致的测试应用（全局前缀 + URI 版本化，防止 v1/v2 路由注册差异） */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  app.use(requestContextMiddleware);
  configureApiBase(app, 'api');
  await app.init();
  return app;
}

export async function login(
  app: INestApplication,
  username: string,
  password: string,
): Promise<LoginResult> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ username, password });
  expect(res.body.code).toBe(1);
  return res.body.data as LoginResult;
}

/** 轮询直到谓词满足（审计异步落库等最终一致场景），超时返回末次值供断言报错 */
export async function pollUntil<T>(
  fn: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs = 5000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let current: T = await fn();
  while (!predicate(current) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    current = await fn();
  }
  return current;
}

export async function getAuditList(
  app: INestApplication,
  token: string,
  limit = 100,
): Promise<Array<Record<string, unknown>>> {
  const res = await request(app.getHttpServer())
    .get(`/api/v1/audit?limit=${limit}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  return res.body.data.list as Array<Record<string, unknown>>;
}
