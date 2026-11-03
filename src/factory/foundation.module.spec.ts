process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'file:./dev.db';
process.env.LOG_LEVEL = 'silent';

import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AUDIT_SINK } from '../contracts/index.js';
import type { AuditEntry, AuditSink } from '../contracts/index.js';
import { PrismaAuditSink } from '../infra/audit/prisma-audit.sink.js';
import { AuditService } from '../infra/audit/audit.service.js';
import { FoundationModule } from './foundation.module.js';

/**
 * FoundationModule 装配契约：
 *  - 默认装配完整（ConfigService 全局可用、AUDIT_SINK 绑定默认 Prisma 实现）
 *  - L1 配置覆盖：config 作为附加 load 工厂生效
 *  - L2 DI 替换：replacements 中同 Token Provider 以 last-wins 覆盖默认实现，且服务层委托到位
 */

const fakeEntries: AuditEntry[] = [
  {
    id: 'fake-1',
    requestId: 'req-fake',
    tenantId: null,
    action: 'fake:action',
    method: 'GET',
    path: '/fake',
    actorId: null,
    actorUsername: null,
    success: true,
    durationMs: 0,
    createdAt: new Date().toISOString(),
  },
];

const fakeSink: AuditSink = {
  record: async (): Promise<void> => undefined,
  list: async (): Promise<AuditEntry[]> => fakeEntries,
};

describe('FoundationModule', () => {
  it('默认装配：ConfigService 全局可用，AUDIT_SINK 绑定默认 Prisma 实现', async (): Promise<void> => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [FoundationModule.forRoot()],
    }).compile();

    expect(moduleRef.get(ConfigService, { strict: false })).toBeDefined();
    expect(moduleRef.get<AuditSink>(AUDIT_SINK, { strict: false })).toBeInstanceOf(PrismaAuditSink);
  });

  it('L1 配置覆盖：config 作为附加 load 工厂覆盖默认 configuration', async (): Promise<void> => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [FoundationModule.forRoot({ config: { app: { port: 4321 } } })],
    }).compile();

    expect(moduleRef.get(ConfigService, { strict: false }).get('app.port')).toBe(4321);
  });

  it('L2 DI 替换：同 Token Provider last-wins 覆盖默认实现，AuditService 委托到替换实现', async (): Promise<void> => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        FoundationModule.forRoot({
          replacements: [{ provide: AUDIT_SINK, useValue: fakeSink }],
        }),
      ],
    }).compile();

    expect(moduleRef.get<AuditSink>(AUDIT_SINK, { strict: false })).toBe(fakeSink);
    const auditService = moduleRef.get(AuditService);
    await expect(auditService.list(5)).resolves.toBe(fakeEntries);
  });
});
