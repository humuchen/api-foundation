process.env.LOG_LEVEL = 'silent';

import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, login } from './helpers';
import type { LoginResult } from '../src/infra/auth/auth.types';

/**
 * 认证域 E2E：双凭证签发 / refresh 轮换一次性 / refresh 防混用 / 登出黑名单。
 * 登录端点限流 5 次/分钟：本文件登录调用 4 次（beforeAll + 三个流程），留有余量。
 */
describe('认证域 E2E（auth）', () => {
  let app: INestApplication;
  let adminLogin: LoginResult;

  beforeAll(async () => {
    app = await createTestApp();
    adminLogin = await login(app, 'admin', 'admin123');
  });

  afterAll(async () => {
    await app.close();
  });

  it('登录签发双凭证，access 可访问业务接口（/auth/profile）', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${adminLogin.accessToken}`)
      .expect(200);
    expect(res.body.code).toBe(1);
    expect(res.body.data.username).toBe('admin');
    expect(res.body.data.jti).toBeTruthy();
    expect(res.body.data.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('错误密码 → 401 / 20001（不区分用户名/密码错误，防账号探测）', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'wrong-password' })
      .expect(401);
    expect(res.body.code).toBe(20001);
    expect(res.body.message).toBe('用户名或密码错误');
  });

  it('refresh 换取新凭证对并可访问业务接口', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: adminLogin.refreshToken })
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

  it('refresh 轮换：同一 refreshToken 二次使用 → 401 / 20001（一次性凭证）', async () => {
    const first = await login(app, 'admin', 'admin123');
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(201);
    const replay = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(401);
    expect(replay.body.code).toBe(20001);
    expect(replay.body.message).toBe('刷新凭证已使用或已撤销');
  });

  it('refresh 凭证不得当 access 用 → 401 / 20001', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${adminLogin.refreshToken}`)
      .expect(401);
    expect(res.body.code).toBe(20001);
  });

  it('登出：access 立即失效（黑名单），配套 refreshToken 亦被吊销', async () => {
    const flow = await login(app, 'admin', 'admin123');
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${flow.accessToken}`)
      .send({ refreshToken: flow.refreshToken })
      .expect(201);

    const accessGone = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${flow.accessToken}`)
      .expect(401);
    expect(accessGone.body.code).toBe(20001);
    expect(accessGone.body.message).toBe('凭证已撤销，请重新登录');

    const refreshGone = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: flow.refreshToken })
      .expect(401);
    expect(refreshGone.body.code).toBe(20001);
  });
});
