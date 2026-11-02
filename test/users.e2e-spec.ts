process.env.LOG_LEVEL = 'silent';

import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, login } from './helpers.js';
import type { LoginResult } from '../src/infra/auth/auth.types.js';

/**
 * 用户域 E2E：分页契约 / RBAC / 参数校验 / 幂等键 / 缓存失效 / 租户行级隔离。
 * 每次运行使用唯一用户名/租户（dev.db 跨运行持久，避免历史数据干扰断言）。
 */
describe('用户域 E2E（users）', () => {
  let app: INestApplication;
  let adminToken: string;
  let demoToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    const admin: LoginResult = await login(app, 'admin', 'admin123');
    adminToken = admin.accessToken;
    demoToken = (await login(app, 'demo', 'demo123456')).accessToken;
  });

  afterAll(async () => {
    await app.close();
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
    expect(res.body.data.list[0]).toHaveProperty('tenantId');
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
  });

  it('租户隔离：租户头创建归属租户；租户视角仅见租户用户，平台账号不可见', async () => {
    const tenantId = `tenant-iso-${Date.now()}`;
    const username = `tn_${Date.now()}`;
    const create = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Tenant-Id', tenantId)
      .send({ username, password: 'idem123456', roles: ['user'] })
      .expect(201);
    // 创建结果归属当前租户
    expect(create.body.data.tenantId).toBe(tenantId);

    // 平台视角（无租户头）：keyword 可检索到该用户
    const platformView = await request(app.getHttpServer())
      .get(`/api/v1/users?keyword=${username}&pageSize=100`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(platformView.body.data.total).toBe(1);
    expect(platformView.body.data.list[0].tenantId).toBe(tenantId);

    // 租户视角（带租户头）：仅见本租户用户；种子平台账号（tenantId=null）被隔离
    const tenantView = await request(app.getHttpServer())
      .get('/api/v1/users?page=1&pageSize=100')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Tenant-Id', tenantId)
      .expect(200);
    expect(tenantView.body.data.total).toBe(1);
    expect(tenantView.body.data.list[0].username).toBe(username);
    expect(tenantView.body.data.list.some((u: { username: string }) => u.username === 'admin')).toBe(false);
  });
});
