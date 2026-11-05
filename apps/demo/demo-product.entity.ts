import type { CrudEntityDefinition } from '../../src/modules/admin/index.js';

/**
 * 通用 CRUD 引擎的业务实体定义示例（宿主业务侧持有，不入核心包）。
 * 注册方式：AdminModule.forRoot({ crudEntities: [DEMO_PRODUCT_ENTITY] })
 * 前端零硬编码：GET /admin/crud/products/schema 即本定义原样下发。
 */
export const DEMO_PRODUCT_ENTITY: CrudEntityDefinition = {
  resource: 'products',
  model: 'demoProduct',
  title: '商品',
  description: 'demo 宿主示例资源：演示通用 CRUD 引擎的表格/表单/字典联动全链路',
  permissionPrefix: 'demo:product',
  fields: [
    {
      key: 'name',
      label: '商品名称',
      type: 'string',
      required: true,
      inFilter: true,
      sortable: true,
      maxLength: 100,
      placeholder: '请输入商品名称',
    },
    {
      key: 'categoryCode',
      label: '商品分类',
      type: 'dict',
      dictType: 'demo_category',
      required: true,
      inFilter: true,
      defaultValue: 'other',
    },
    {
      key: 'price',
      label: '价格',
      type: 'number',
      required: true,
      sortable: true,
      min: 0,
      max: 9999999,
      width: 120,
    },
    {
      key: 'stock',
      label: '库存',
      type: 'integer',
      sortable: true,
      min: 0,
      defaultValue: 0,
      width: 100,
    },
    {
      key: 'status',
      label: '状态',
      type: 'dict',
      dictType: 'demo_status',
      inFilter: true,
      defaultValue: 'draft',
      width: 100,
    },
  ],
};
