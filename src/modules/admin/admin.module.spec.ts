process.env.LOG_LEVEL = 'silent';

import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { APP_GUARD } from '@nestjs/core';
import { BizException } from '../../common/exceptions/biz.exception.js';
import { ErrorCode } from '../../common/error-codes.js';
import type { CrudEntityDefinition } from './admin.contracts.js';
import { AdminModule } from './admin.module.js';
import { CrudRegistry } from './crud/crud.registry.js';
import { AdminSeed } from './seed/admin.seed.js';
import { UserModule } from '../user/index.js';

const definition: CrudEntityDefinition = {
  resource: 'products',
  model: 'demoProduct',
  title: '商品',
  fields: [{ key: 'name', label: '名称', type: 'string', required: true }],
};

describe('AdminModule.forRoot 装配契约', () => {
  it('默认装配：注册 @RequirePerm 守卫（APP_GUARD）与种子', () => {
    const dm = AdminModule.forRoot();
    expect(dm.module).toBe(AdminModule);
    const guard = dm.providers?.find((p) => typeof p === 'object' && p !== null && 'provide' in p && p.provide === APP_GUARD);
    expect(guard).toBeDefined();
  });

  it('enablePermissionGuard=false：不注册权限守卫（退回纯 @Roles 模式）', () => {
    const dm = AdminModule.forRoot({ enablePermissionGuard: false });
    const guard = dm.providers?.find((p) => typeof p === 'object' && p !== null && 'provide' in p && p.provide === APP_GUARD);
    expect(guard).toBeUndefined();
  });

  it('seed=false：不注册 AdminSeed', () => {
    const dm = AdminModule.forRoot({ seed: false });
    const hasSeed = dm.providers?.some((p) => typeof p === 'function' && p === AdminSeed);
    expect(hasSeed).toBe(false);
  });

  it('crudEntities：经注册表工厂在装配期完成注册（fail-fast）', () => {
    const dm = AdminModule.forRoot({ crudEntities: [definition] });
    const factory = dm.providers?.find(
      (p) => typeof p === 'object' && p !== null && 'provide' in p && p.provide === CrudRegistry,
    ) as { useFactory: () => CrudRegistry } | undefined;
    expect(factory).toBeDefined();
    const registry = factory?.useFactory();
    expect(registry?.has('products')).toBe(true);
    expect(registry?.get('products').title).toBe('商品');
  });

  it('imports：聚合 UserModule（bootstrap 当前用户信息）', () => {
    const dm = AdminModule.forRoot();
    expect(dm.imports).toContain(UserModule);
  });
});

describe('CrudRegistry（实体定义注册表）', () => {
  it('未注册资源 → 33401', () => {
    const registry = new CrudRegistry();
    try {
      registry.get('missing');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BizException);
      expect((e as BizException).bizCode).toBe(ErrorCode.ADMIN_CRUD_RESOURCE_NOT_FOUND);
    }
  });

  it('重复注册/非法 resource/非法 model/空字段/重复字段 key → fail-fast', () => {
    const registry = new CrudRegistry();
    registry.register(definition);
    expect(() => registry.register(definition)).toThrow(BizException);
    expect(() => registry.register({ ...definition, resource: 'Bad_Resource' })).toThrow(BizException);
    expect(() => registry.register({ ...definition, resource: 'things2', model: '1bad' })).toThrow(BizException);
    expect(() => registry.register({ ...definition, resource: 'things3', fields: [] })).toThrow(BizException);
    expect(() =>
      registry.register({
        ...definition,
        resource: 'things4',
        fields: [
          { key: 'a', label: 'A', type: 'string' },
          { key: 'a', label: 'A2', type: 'string' },
        ],
      }),
    ).toThrow(BizException);
  });

  it('summary：输出权限前缀与只读标记（permissionPrefix 缺省 crud:<resource>）', () => {
    const registry = new CrudRegistry();
    registry.register(definition);
    registry.register({ ...definition, resource: 'logs', readOnly: true, permissionPrefix: 'audit:log', model: 'auditLog', fields: [{ key: 'a', label: 'A', type: 'string' }] });
    const summary = registry.summary();
    expect(summary.find((s) => s.resource === 'products')?.permissionPrefix).toBe('crud:products');
    expect(summary.find((s) => s.resource === 'logs')).toMatchObject({ readOnly: true, permissionPrefix: 'audit:log' });
  });
});
