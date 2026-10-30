process.env.LOG_LEVEL = 'silent';

import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApiBase } from '../src/config/api-base';
import { requestContextMiddleware } from '../src/infra/logger';
import type { LoginResult } from '../src/infra/auth/auth.types';

/**
 * 底座 E2E 冒烟：统一响应 / 鉴权 / RBAC / 分页 / 参数校验 / 404 兜底 / 审计脱敏 /
 * refresh 双凭证 / 幂等键 / 缓存失效 / URI 版本化 / 租户上下文。
 * 独立应用实例（不占端口，supertest 直连 http server）。
 */
describe('接口底座 E2E', () => {
  let app: INestApplication;
  let adminToken: string;
  let adminRefreshToken: string;
  let demoToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.use(requestContextMiddleware);
    // 与生产一致的 API 基础形态（前缀 + URI 版本化），防止 v1/v2 路由注册差异
    configureApiBase(app, 'api');
    await app.init();
    const adminLogin = await postLogin('admin', 'admin123');
    adminToken = adminLogin.accessToken;
    adminRefreshToken = adminLogin.refreshToken;
    demoToken = (await postLogin('demo', 'demo123456')).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  const postLogin = async (username: string, password: string): Promise<LoginResult> => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username, password });
    expect(res.body.code).toBe(1);
    return res.body.data as LoginResult;
  };

  it('GET /health 公开端点：统一包壳 + requestId', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body.code).toBe(1);
    expect(res.body.data.status).toBe('up');
    expect(res.body.requestId).toBeTruthy();
    expect(typeof res.body.timestamp).toBe('number');
  });

  it('未登录访问受保护端点 → 401 / 20001', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/hello').expect(401);
    expect(res.body.code).toBe(20001);
    expect(res.body.message).toBe('未登录或凭证无效');
  });

  it('错误密码 → 401 / 20001（不区分用户名/密码错误）', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'wrong-password' })
      .expect(401);
    expect(res.body.code).toBe(20001);
    expect(res.body.message).toBe('用户名或密码错误');
  });

  it('refresh token：换取新凭证对并可访问业务接口', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: adminRefreshToken })
      .expect(201);
    expect(res.body.code).toBe(1);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
    expect(res.body.data.refreshExpiresIn).toBe('7d');
    const me = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${res.body.data.accessToken as string}`)
      .expect(200);
    expect(me.body.data.username).toBe('admin');
  });

  it('refresh 凭证不得当 access 用 → 401 / 20001', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${adminRefreshToken}`)
      .expect(401);
    expect(res.body.code).toBe(20001);
  });

  it('审计：登录已记录且 password 强制脱敏', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/audit?limit=50')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const loginEntry = res.body.data.list.find(
      (e: { action: string }) => e.action === 'auth:login',
    );
    expect(loginEntry).toBeTruthy();
    expect(loginEntry.body.password).toBe('***');
    expect(loginEntry.requestId).toBeTruthy();
  });

  it('admin 分页查询 → PageVo 结构 + VO 不外泄 passwordHash', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/users?page=1&pageSize=2')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.code).toBe(1);
    expect(res.body.data.total).toBeGreaterThanOrEqual(3);
    expect(res.body.data.list).toHaveLength(2);
    expect(res.body.data.totalPages).toBeGreaterThanOrEqual(2);
    expect(res.body.data.list[0]).not.toHaveProperty('passwordHash');
  });

  it('user 角色访问 admin 端点 → 403 / 20003 + requiredRoles', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${demoToken}`)
      .expect(403);
    expect(res.body.code).toBe(20003);
    expect(res.body.data.requiredRoles).toContain('admin');
  });

  it('任意登录用户访问 /users/me → 200', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${demoToken}`)
      .expect(200);
    expect(res.body.data.username).toBe('demo');
  });

  it('参数校验失败 → 400 / 10001 + 字段级明细', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ username: 'x', password: '1', roles: [] })
      .expect(400);
    expect(res.body.code).toBe(10001);
    expect(res.body.data.length).toBeGreaterThan(0);
    const fields = res.body.data.map((d: { field: string }) => d.field);
    expect(fields).toContain('username');
    expect(fields).toContain('password');
  });

  it('幂等键：同键重复提交不重复创建，且写后读立即可见（缓存已失效）', async () => {
    const idemKey = randomUUID();
    const username = `idem_${Date.now()}`;
    const body = { username, password: 'idem123456', roles: ['user'] };
    const auth = { Authorization: `Bearer ${adminToken}`, 'Idempotency-Key': idemKey, 'X-Tenant-Id': 't-e2e' };

    const first = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set(auth)
      .send(body)
      .expect(201);
    const second = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set(auth)
      .send(body)
      .expect(201);

    expect(second.headers['x-idempotent-replayed']).toBe('true');
    expect(second.body.data.id).toBe(first.body.data.id);

    // 写后读：分页缓存已被失效，立即可见新用户
    const page = await request(app.getHttpServer())
      .get(`/api/v1/users?keyword=${username}&pageSize=100`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(page.body.data.total).toBe(1);

    // 审计：携带租户上下文
    const audit = await request(app.getHttpServer())
      .get('/api/v1/audit?limit=50')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const createEntry = audit.body.data.list.find(
      (e: { action: string; body?: { username?: string } }) =>
        e.action === 'user:create' && e.body?.username === username,
    );
    expect(createEntry).toBeTruthy();
    expect(createEntry.tenantId).toBe('t-e2e');
    expect(createEntry.body.password).toBe('***');
  });

  it('URI 版本化：/api/v2/hello 公开可用且与 v1 形态不同', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v2/hello?name=E2E')
      .expect(200);
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
