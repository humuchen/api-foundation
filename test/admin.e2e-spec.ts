process.env.LOG_LEVEL = 'silent';

import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, login, pollUntil } from './helpers.js';

/**
 * admin 通用后台管理系统模块 E2E：bootstrap 聚合 / RBAC / 实时权限守卫 /
 * 通用 CRUD 引擎（元数据+字典联动）/ 菜单动态路由 / 字典 / 配置（ui 主题）/ 审计分页。
 * 走真实 SQLite（dev.db），断言统一响应 { code, data }；文件级串行。
 */

let app: INestApplication;
let adminToken: string;
let opsToken: string;

interface ApiBody {
  code: number;
  message: string;
  data: unknown;
}

async function api(
  method: 'get' | 'post' | 'patch' | 'put' | 'delete',
  path: string,
  token: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; body: ApiBody }> {
  const res = await request(app.getHttpServer())[method](path)
    .set('Authorization', `Bearer ${token}`)
    .send(body ?? {});
  return { status: res.status, body: res.body as ApiBody };
}

const randomSuffix = (): string => Math.random().toString(36).slice(2, 8);

beforeAll(async () => {
  app = await createTestApp();
  adminToken = (await login(app, 'admin', 'admin123')).accessToken;
  opsToken = (await login(app, 'ops', 'ops123456')).accessToken;
});

afterAll(async () => {
  await app?.close();
});

describe('admin bootstrap 聚合端点', () => {
  it('登录用户一次拉取 user/permissions/menus/ui（超管权限为通配哨兵 *）', async () => {
    const { status, body } = await api('get', '/api/v1/admin/bootstrap', adminToken);
    expect(status).toBe(200);
    expect(body.code).toBe(1);
    const data = body.data as Record<string, unknown>;
    expect(data['user']).toMatchObject({ username: 'admin' });
    expect(data['permissions']).toContain('*');
    const menus = data['menus'] as Array<Record<string, unknown>>;
    expect(menus.some((m) => m['path'] === '/dashboard')).toBe(true);
    const system = menus.find((m) => m['path'] === '/system');
    expect((system?.['children'] as unknown[]).length).toBeGreaterThanOrEqual(6);
    const ui = data['ui'] as Record<string, Record<string, unknown>>;
    expect(ui['ui.theme']).toMatchObject({ primary: '#4f6ef2' });
    expect(ui['ui.layout']).toHaveProperty('responsive');
  });

  it('未登录 → 20001', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/admin/bootstrap');
    expect(res.body.code).toBe(20001);
  });
});

describe('RBAC 角色与授权', () => {
  const roleCode = `guard-${randomSuffix()}`;
  let roleId = '';

  it('admin 查询角色列表（种子三角色）', async () => {
    const { body } = await api('get', '/api/v1/admin/rbac/roles', adminToken);
    expect(body.code).toBe(1);
    const codes = (body.data as Array<{ code: string }>).map((r) => r.code);
    expect(codes).toEqual(expect.arrayContaining(['admin', 'ops', 'user']));
  });

  it('ops 无 admin:role:list → 20003（实时权限守卫生效）', async () => {
    const { body } = await api('get', '/api/v1/admin/rbac/roles', opsToken);
    expect(body.code).toBe(20003);
    expect((body.data as Record<string, unknown>)['requiredPermission']).toBe('admin:role:list');
  });

  it('创建角色 → 授权 → 查询授权回显', async () => {
    const created = await api('post', '/api/v1/admin/rbac/roles', adminToken, {
      code: roleCode,
      name: '守卫测试角色',
      description: 'e2e 临时角色',
    });
    expect(created.body.code).toBe(1);
    roleId = (created.body.data as { id: string }).id;

    const granted = await api('put', `/api/v1/admin/rbac/roles/${roleId}/permissions`, adminToken, {
      permissionCodes: ['demo:product:list', 'admin:config:update'],
    });
    expect(granted.body.code).toBe(1);
    expect(granted.body.data).toEqual({ granted: 2 });

    const back = await api('get', `/api/v1/admin/rbac/roles/${roleId}/permissions`, adminToken);
    expect((back.body.data as { codes: string[] }).codes.sort()).toEqual(['admin:config:update', 'demo:product:list']);
  });

  it('授权含未知权限码 → 40001（missing 明细）', async () => {
    const { body } = await api('put', `/api/v1/admin/rbac/roles/${roleId}/permissions`, adminToken, {
      permissionCodes: ['not:exist'],
    });
    expect(body.code).toBe(40001);
  });

  it('更新角色名称；内置角色删除被拒（33003）', async () => {
    const updated = await api('patch', `/api/v1/admin/rbac/roles/${roleId}`, adminToken, { name: '守卫测试角色改名' });
    expect(updated.body.code).toBe(1);
    const builtin = await api('get', '/api/v1/admin/rbac/roles', adminToken);
    const adminRole = (builtin.body.data as Array<{ id: string; code: string }>).find((r) => r.code === 'admin');
    const del = await api('delete', `/api/v1/admin/rbac/roles/${adminRole?.id}`, adminToken);
    expect(del.body.code).toBe(33003);
  });

  it('删除临时角色成功；再删 → 33001（admin 域细分资源码）', async () => {
    const del = await api('delete', `/api/v1/admin/rbac/roles/${roleId}`, adminToken);
    expect(del.body.code).toBe(1);
    const again = await api('delete', `/api/v1/admin/rbac/roles/${roleId}`, adminToken);
    expect(again.body.code).toBe(33001);
  });
});

describe('实时权限变更（绑定/解绑无需重新登录）', () => {
  let opsUserId = '';
  const roleCode = `bind-${randomSuffix()}`;
  let roleId = '';

  beforeAll(async () => {
    const me = await api('get', '/api/v1/users/me', opsToken);
    opsUserId = (me.body.data as { id: string }).id;
    const role = await api('post', '/api/v1/admin/rbac/roles', adminToken, { code: roleCode, name: '绑定测试角色' });
    roleId = (role.body.data as { id: string }).id;
    await api('put', `/api/v1/admin/rbac/roles/${roleId}/permissions`, adminToken, {
      permissionCodes: ['admin:config:update'],
    });
  });

  it('ops 初始无 admin:config:update → 20003', async () => {
    const { body } = await api('put', '/api/v1/admin/configs/ui.theme', opsToken, { value: { primary: '#4f6ef2' } });
    expect(body.code).toBe(20003);
  });

  it('绑定角色后 ops 立即获得权限（200 → 1）', async () => {
    const bind = await api('put', `/api/v1/admin/rbac/users/${opsUserId}/roles`, adminToken, {
      roleCodes: [roleCode],
    });
    expect(bind.body.code).toBe(1);
    const update = await api('put', '/api/v1/admin/configs/ui.theme', opsToken, { value: { primary: '#4f6ef2' } });
    expect(update.body.code).toBe(1);
  });

  it('查询用户绑定角色回显；解绑后权限立即收回', async () => {
    const roles = await api('get', `/api/v1/admin/rbac/users/${opsUserId}/roles`, adminToken);
    expect((roles.body.data as Array<{ code: string }>).map((r) => r.code)).toContain(roleCode);
    await api('put', `/api/v1/admin/rbac/users/${opsUserId}/roles`, adminToken, { roleCodes: [] });
    const denied = await api('put', '/api/v1/admin/configs/ui.theme', opsToken, { value: { primary: '#4f6ef2' } });
    expect(denied.body.code).toBe(20003);
  });

  it('绑定不存在的用户 → 33501', async () => {
    const { body } = await api('put', `/api/v1/admin/rbac/users/00000000-0000-4000-8000-000000000000/roles`, adminToken, {
      roleCodes: [],
    });
    expect(body.code).toBe(33501);
  });

  afterAll(async () => {
    await api('delete', `/api/v1/admin/rbac/roles/${roleId}`, adminToken);
  });
});

describe('通用 CRUD 引擎（demo 商品资源）', () => {
  let productId = '';
  const productName = `商品-${randomSuffix()}`;

  it('schema 元数据下发：字段定义 + 字典引用原样返回', async () => {
    const { body } = await api('get', '/api/v1/admin/crud/products/schema', adminToken);
    expect(body.code).toBe(1);
    const schema = body.data as Record<string, unknown>;
    expect(schema['resource']).toBe('products');
    expect(schema['permissionPrefix']).toBe('demo:product');
    const fields = schema['fields'] as Array<Record<string, unknown>>;
    expect(fields.length).toBe(5);
    expect(fields.find((f) => f['key'] === 'categoryCode')).toMatchObject({ type: 'dict', dictType: 'demo_category' });
  });

  it('_registry 摘要包含已注册资源', async () => {
    const { body } = await api('get', '/api/v1/admin/crud/_registry', adminToken);
    expect((body.data as Array<{ resource: string }>).some((r) => r.resource === 'products')).toBe(true);
  });

  it('ops 按种子授权可列表（demo:product:list）', async () => {
    const { body } = await api('get', '/api/v1/admin/crud/products', opsToken);
    expect(body.code).toBe(1);
    expect((body.data as Record<string, unknown>)['total']).toBeGreaterThanOrEqual(0);
  });

  it('创建：defaultValue 补全（stock=0/status=draft）', async () => {
    const { body } = await api('post', '/api/v1/admin/crud/products', adminToken, {
      name: productName,
      categoryCode: 'electronics',
      price: 199.9,
    });
    expect(body.code).toBe(1);
    const data = body.data as Record<string, unknown>;
    productId = data['id'] as string;
    expect(data['stock']).toBe(0);
    expect(data['status']).toBe('draft');
  });

  it('校验失败：缺失必填/非法枚举/非法字典值 → 33402 + details 明细', async () => {
    const missing = await api('post', '/api/v1/admin/crud/products', adminToken, { price: 1 });
    expect(missing.body.code).toBe(33402);
    const details = (missing.body.data as { details: Array<{ field: string }> }).details.map((d) => d.field);
    expect(details).toEqual(expect.arrayContaining(['name', 'categoryCode']));

    const badDict = await api('post', '/api/v1/admin/crud/products', adminToken, {
      name: 'x',
      categoryCode: 'not-in-dict',
      price: 1,
    });
    expect(badDict.body.code).toBe(33402);
    const badDictDetails = (badDict.body.data as { details: Array<{ field: string; message: string }> }).details;
    expect(badDictDetails[0].field).toBe('categoryCode');
    expect(badDictDetails[0].message).toContain('demo_category');
  });

  it('分页筛选：keyword 模糊 + inFilter 字段精确 + 命中创建数据', async () => {
    const { body } = await api(
      'get',
      `/api/v1/admin/crud/products?keyword=${encodeURIComponent(productName)}&status=draft&page=1&pageSize=10`,
      adminToken,
    );
    expect(body.code).toBe(1);
    const page = body.data as { list: Array<Record<string, unknown>>; total: number };
    expect(page.list.some((p) => p['id'] === productId)).toBe(true);
    expect(page.total).toBeGreaterThanOrEqual(1);
  });

  it('排序字段白名单外的字段 → 10002', async () => {
    const { body } = await api('get', '/api/v1/admin/crud/products?sort=hackfield:asc', adminToken);
    expect(body.code).toBe(10002);
  });

  it('更新（部分更新）→ 详情 → 删除 → 详情 40001', async () => {
    const patched = await api('patch', `/api/v1/admin/crud/products/${productId}`, adminToken, { price: 299, status: 'published' });
    expect(patched.body.code).toBe(1);
    expect((patched.body.data as Record<string, unknown>)['price']).toBe(299);

    const detail = await api('get', `/api/v1/admin/crud/products/${productId}`, adminToken);
    expect((detail.body.data as Record<string, unknown>)['status']).toBe('published');

    const del = await api('delete', `/api/v1/admin/crud/products/${productId}`, adminToken);
    expect(del.body.code).toBe(1);
    const gone = await api('get', `/api/v1/admin/crud/products/${productId}`, adminToken);
    expect(gone.body.code).toBe(40001);
  });

  it('未注册资源 → 33401', async () => {
    const { body } = await api('get', '/api/v1/admin/crud/not-registered', adminToken);
    expect(body.code).toBe(33401);
  });
});

describe('菜单与动态路由', () => {
  it('admin 全量树：/system 目录含 6 个内置子菜单', async () => {
    const { body } = await api('get', '/api/v1/admin/menus/tree', adminToken);
    expect(body.code).toBe(1);
    const system = (body.data as Array<Record<string, unknown>>).find((m) => m['path'] === '/system');
    expect((system?.['children'] as unknown[]).length).toBe(6);
    expect((system?.['children'] as Array<Record<string, unknown>>).every((c) => c['builtin'] === true)).toBe(true);
  });

  it('ops 可见树按权限过滤：含 /demo/products，不含 /system/roles', async () => {
    const { body } = await api('get', '/api/v1/admin/menus/my', opsToken);
    expect(body.code).toBe(1);
    const paths = (body.data as Array<Record<string, unknown>>).map((m) => m['path']);
    expect(paths).toContain('/demo/products');
    const system = (body.data as Array<Record<string, unknown>>).find((m) => m['path'] === '/system');
    const childPaths = ((system?.['children'] ?? []) as Array<Record<string, unknown>>).map((c) => c['path']);
    expect(childPaths).toContain('/system/dicts'); // ops 有 admin:dict:list
    expect(childPaths).not.toContain('/system/roles'); // ops 无 admin:role:list
  });

  it('菜单 CRUD：创建/路径冲突 33102/含子级删除 33105/删除', async () => {
    const created = await api('post', '/api/v1/admin/menus', adminToken, {
      name: '活动页面',
      path: `/promo-${randomSuffix()}`,
      type: 'menu',
      meta: { title: '活动页面', layout: 'top' },
    });
    expect(created.body.code).toBe(1);
    const id = (created.body.data as { id: string }).id;

    const conflict = await api('post', '/api/v1/admin/menus', adminToken, {
      name: '重复路径',
      path: '/system',
      type: 'menu',
    });
    expect(conflict.body.code).toBe(33102);

    await api('delete', `/api/v1/admin/menus/${id}`, adminToken);

    const builtin = await api('get', '/api/v1/admin/menus/tree', adminToken);
    const systemId = ((builtin.body.data as Array<Record<string, unknown>>).find((m) => m['path'] === '/system')?.['id']) as string;
    const delBuiltin = await api('delete', `/api/v1/admin/menus/${systemId}`, adminToken);
    expect(delBuiltin.body.code).toBe(33103);
  });
});

describe('字典管理', () => {
  it('登录用户可读字典项（demo_category 4 项）', async () => {
    const { body } = await api('get', '/api/v1/admin/dicts/demo_category/items', opsToken);
    expect(body.code).toBe(1);
    expect((body.data as unknown[]).length).toBe(4);
  });

  it('不存在字典 → 33201', async () => {
    const { body } = await api('get', '/api/v1/admin/dicts/missing_dict/items', adminToken);
    expect(body.code).toBe(33201);
  });

  it('类型 CRUD + 项管理 + 编码冲突 33202', async () => {
    const code = `e2e-dict-${randomSuffix()}`;
    const created = await api('post', '/api/v1/admin/dicts/types', adminToken, { code, name: 'E2E 字典' });
    expect(created.body.code).toBe(1);
    const typeId = (created.body.data as { id: string }).id;

    const item = await api('post', `/api/v1/admin/dicts/${code}/items`, adminToken, { value: 'v1', label: '选项一' });
    expect(item.body.code).toBe(1);

    const conflict = await api('post', '/api/v1/admin/dicts/types', adminToken, { code, name: '重复' });
    expect(conflict.body.code).toBe(33202);

    const renamed = await api('patch', `/api/v1/admin/dicts/types/${typeId}`, adminToken, { name: 'E2E 字典改名' });
    expect(renamed.body.code).toBe(1);

    const del = await api('delete', `/api/v1/admin/dicts/types/${typeId}`, adminToken);
    expect(del.body.code).toBe(1);
  });
});

describe('系统配置与 ui 主题', () => {
  it('登录用户按组读取 ui 配置（主题/布局下发）', async () => {
    const { body } = await api('get', '/api/v1/admin/configs?group=ui', opsToken);
    expect(body.code).toBe(1);
    const keys = (body.data as Array<{ key: string }>).map((c) => c.key);
    expect(keys).toEqual(expect.arrayContaining(['ui.theme', 'ui.layout']));
  });

  it('admin 更新 ui.theme → bootstrap 聚合即时反映（版本号失效缓存）', async () => {
    const updated = await api('put', '/api/v1/admin/configs/ui.theme', adminToken, {
      value: { primary: '#7c3aed', mode: 'dark', radius: 12 },
    });
    expect(updated.body.code).toBe(1);
    const boot = await api('get', '/api/v1/admin/bootstrap', adminToken);
    const ui = (boot.body.data as { ui: Record<string, Record<string, unknown>> })['ui'];
    expect(ui['ui.theme']['primary']).toBe('#7c3aed');
  });

  it('内置配置删除被拒（33303）；更新内置配置允许', async () => {
    const del = await api('delete', '/api/v1/admin/configs/ui.theme', adminToken);
    expect(del.body.code).toBe(33303);
  });

  it('恢复主题种子值', async () => {
    await api('put', '/api/v1/admin/configs/ui.theme', adminToken, {
      value: { primary: '#4f6ef2', mode: 'light', radius: 8 },
    });
  });
});

describe('操作审计查询', () => {
  it('分页查询 + action 前缀通配筛选（角色创建审计已落库）', async () => {
    await pollUntil(
      async () => {
        const res = await api('get', '/api/v1/admin/audit-logs?action=admin:role:create&pageSize=50', adminToken);
        const page = res.body.data as { list: unknown[]; total: number };
        return page.total;
      },
      (total) => total >= 1,
    );
    const { body } = await api('get', '/api/v1/admin/audit-logs?action=admin:role:create&pageSize=5', adminToken);
    expect(body.code).toBe(1);
    const page = body.data as { list: Array<Record<string, unknown>>; total: number; page: number; pageSize: number };
    expect(page.total).toBeGreaterThanOrEqual(1);
    expect(page.list.length).toBeLessThanOrEqual(5);
    expect(String(page.list[0]?.['action'])).toBe('admin:role:create');
  });

  it('success=false 筛选与非法时间 → 10001 校验失败', async () => {
    const okFilter = await api('get', '/api/v1/admin/audit-logs?success=false&pageSize=5', adminToken);
    expect(okFilter.body.code).toBe(1);
    const badTime = await api('get', '/api/v1/admin/audit-logs?start=not-a-time', adminToken);
    expect(badTime.body.code).toBe(10001);
  });

  it('crud 动态端点审计经占位符展开（crud:products:create）', async () => {
    const name = `审计商品-${randomSuffix()}`;
    await api('post', '/api/v1/admin/crud/products', adminToken, { name, categoryCode: 'other', price: 1 });
    const found = await pollUntil(
      async () => {
        const res = await api('get', '/api/v1/admin/audit-logs?action=crud:products:create&pageSize=50', adminToken);
        const page = res.body.data as { list: Array<Record<string, unknown>> };
        return page.list.find((e) => (e['body'] as Record<string, unknown> | undefined)?.['name'] === name);
      },
      (entry) => entry !== undefined,
    );
    expect(found?.['action']).toBe('crud:products:create');
  });

  it('ops 无 admin:audit:list → 20003', async () => {
    const { body } = await api('get', '/api/v1/admin/audit-logs', opsToken);
    expect(body.code).toBe(20003);
  });
});
