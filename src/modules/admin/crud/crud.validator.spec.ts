process.env.LOG_LEVEL = 'silent';

import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import type { CrudEntityDefinition } from '../admin.contracts.js';
import { validateCrudData } from './crud.validator.js';

const definition: CrudEntityDefinition = {
  resource: 'things',
  model: 'thing',
  title: '示例',
  fields: [
    { key: 'name', label: '名称', type: 'string', required: true, maxLength: 10, pattern: '^[a-z]+$' },
    { key: 'qty', label: '数量', type: 'integer', min: 0, max: 99, defaultValue: 1 },
    { key: 'price', label: '价格', type: 'number', min: 0 },
    { key: 'active', label: '启用', type: 'boolean' },
    { key: 'level', label: '等级', type: 'enum', options: [{ label: '低', value: 'low' }, { label: '高', value: 'high' }] },
    { key: 'category', label: '分类', type: 'dict', dictType: 'demo_category' },
    { key: 'code', label: '编码', type: 'string', required: true, readOnly: true },
    { key: 'hidden', label: '隐藏', type: 'string', inForm: false },
    { key: 'birthday', label: '生日', type: 'date' },
  ],
};

describe('validateCrudData（通用 CRUD 运行时校验器）', () => {
  it('create：必填缺失/未知字段/白名单外字段被拒绝', () => {
    const result = validateCrudData(definition, { qty: 5, unknown: 1 }, 'create');
    expect(result.violations).toEqual(
      expect.arrayContaining([
        { field: 'name', message: '名称 为必填项' },
        { field: 'code', message: '编码 为必填项' },
        { field: 'unknown', message: '未声明的字段' },
      ]),
    );
  });

  it('create：类型收敛与缺省值补全', () => {
    const result = validateCrudData(
      definition,
      { name: 'abc', code: 'A1', qty: '5', price: '9.5', active: 'true', level: 'low', category: 'food' },
      'create',
    );
    expect(result.violations).toEqual([]);
    expect(result.data).toMatchObject({ name: 'abc', code: 'A1', qty: 5, price: 9.5, active: true, level: 'low' });
    expect(result.dictChecks).toEqual([{ field: 'category', dictType: 'demo_category' }]);
  });

  it('create：defaultValue 生效（qty=1）', () => {
    const result = validateCrudData(definition, { name: 'abc', code: 'A1' }, 'create');
    expect(result.data.qty).toBe(1);
  });

  it('create：enum/dict/pattern/maxLength/min/max/日期 类型约束', () => {
    const result = validateCrudData(
      definition,
      { name: 'ABC', code: 'A1', level: 'mid', qty: 100, price: -1, active: 'yes', birthday: '2024/01/01' },
      'create',
    );
    const fields = new Set(result.violations.map((v) => v.field));
    expect(fields).toEqual(new Set(['name', 'level', 'qty', 'price', 'active', 'birthday']));
  });

  it('update：部分更新语义（缺省不改）+ readOnly 字段剥离', () => {
    const result = validateCrudData(definition, { code: 'CHANGED', qty: 3 }, 'update');
    expect(result.violations).toEqual([]);
    expect(result.data).toEqual({ qty: 3 });
    expect(result.data['code']).toBeUndefined();
  });

  it('update：readOnly 字段剥离后必填约束不生效', () => {
    const result = validateCrudData(definition, { name: 'xyz' }, 'update');
    expect(result.violations).toEqual([]);
    expect(result.data).toEqual({ name: 'xyz' });
  });

  it('null：必填字段报错；非必填按未提供处理', () => {
    const result = validateCrudData(definition, { name: null, code: 'A1', qty: null }, 'create');
    expect(result.violations).toEqual([{ field: 'name', message: '名称 为必填项' }]);
    expect(result.data.qty).toBeUndefined();
  });

  it('inForm=false 字段（hidden）写入被拒绝', () => {
    const result = validateCrudData(definition, { name: 'abc', code: 'A1', hidden: 'x' }, 'create');
    expect(result.violations).toContainEqual({ field: 'hidden', message: '未声明的字段' });
  });
});
