process.env.LOG_LEVEL = 'silent';

import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, getAuditList, login, pollUntil } from './helpers';

/**
 * 底座域 E2E：存活/就绪探针 / 全局鉴权默认拒绝 / 统一响应与 404 兜底 /
 * 审计持久化与脱敏 / URI 版本化。
 */
describe('底座域 E2E（foundation）', () => {
  let app: INestApplication;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = (await login(app, 'admin', 'admin123')).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health 存活探针：统一包壳 + requestId', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body.code).toBe(1);
    expect(res.body.data.status).toBe('up');
    expect(res.body.requestId).toBeTruthy();
    expect(typeof res.body.timestamp).toBe('number');
  });

  it('GET /health/ready 就绪探针：数据库连通校验（SELECT 1）', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
    expect(res.body.code).toBe(1);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.database).toBe('up');
  });

  it('未登录访问受保护端点 → 401 / 20001', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/hello').expect(401);
    expect(res.body.code).toBe(20001);
    expect(res.body.message).toBe('未登录或凭证无效');
  });

  it('审计持久化：登录已落库且 password 强制脱敏（异步写入轮询）', async () => {
    const list = await pollUntil(
      () => getAuditList(app, adminToken),
      (entries) =>
        entries.some(
          (e) =>
            e.action === 'auth:login' &&
            (e.body as { password?: string } | undefined)?.password === '***',
        ),
    );
    const loginEntry = list.find((e) => e.action === 'auth:login');
    expect(loginEntry).toBeTruthy();
    expect((loginEntry?.body as { password?: string }).password).toBe('***');
    expect(loginEntry?.requestId).toBeTruthy();
  });

  it('URI 版本化：/api/v2/hello 公开可用且与 v1 形态不同', async () => {
    const res = await request(app.getHttpServer()).get('/api/v2/hello?name=E2E').expect(200);
    expect(res.body.code).toBe(1);
    expect(res.body.data.version).toBe('v2');
    expect(res.body.data.message).toBe('Hello, E2E! (v2)');
    expect(typeof res.body.data.generatedAt).toBe('string');
  });

  it('未知路由 → 404 / 40001 兜底 + requestId', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/nonexistent').expect(404);
    expect(res.body.code).toBe(40001);
    expect(res.body.message).toBe('资源不存在');
    expect(res.body.requestId).toBeTruthy();
  });
});
