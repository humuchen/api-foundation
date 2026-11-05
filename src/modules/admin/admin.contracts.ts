/**
 * admin 模块 SPI 契约与核心类型：通用 CRUD 引擎的实体定义、字段 schema、钩子。
 *
 * 定位：业务逻辑与界面解耦的关键 —— 前端数据表格/表单完全由这里的元数据驱动：
 *  - CrudEntityDefinition 由业务模块声明（配置式注册，见 AdminModuleOptions.crudEntities）
 *  - CrudService 据此动态生成 REST 端点行为（过滤/校验/排序白名单）
 *  - GET /admin/crud/:resource/schema 原样下发元数据，前端渲染器零硬编码
 *
 * 扩展方式：
 *  - 配置式：AdminModule.forRoot({ crudEntities: [...] })
 *  - 运行时：注入 CrudRegistry.register(definition)（业务模块 onModuleInit）
 */

/** 通用 CRUD 字段类型（决定运行时校验规则与前端表单控件映射） */
export type CrudFieldType =
  | 'string'
  | 'text'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'enum'
  | 'dict'
  | 'json';

/** 静态枚举选项（type=enum 时使用；type=dict 时选项由字典服务动态提供） */
export interface CrudFieldOption {
  label: string;
  value: string | number | boolean;
}

/**
 * 字段 schema：表格列与表单项的单一事实来源。
 * inList/inForm/inFilter 三轴正交声明该字段出现在哪些界面通道。
 */
export interface CrudFieldSchema {
  /** 字段名（须与 Prisma model 属性同名；即数据写入键） */
  key: string;
  label: string;
  type: CrudFieldType;
  /** 表单必填（仅约束 create/update 入参；不影响列表） */
  required?: boolean;
  /** 参与列表筛选：string 走 contains 模糊，其余精确等值 */
  inFilter?: boolean;
  /** 允许作为排序字段（并入排序白名单，防排序注入） */
  sortable?: boolean;
  /** 表格列展示（缺省 true） */
  inList?: boolean;
  /** 表单项（缺省 true；false 用于仅展示或系统维护字段） */
  inForm?: boolean;
  /** 编辑时禁止修改（如编码类字段；update 入参中剥离） */
  readOnly?: boolean;
  /** type=dict 时的字典编码（前端经 GET /admin/dicts/:code/items 拉选项） */
  dictType?: string;
  /** type=enum 时的静态选项 */
  options?: CrudFieldOption[];
  /** 数值范围（number/integer） */
  min?: number;
  max?: number;
  /** 字符串最大长度（string/text） */
  maxLength?: number;
  /** 正则约束（string；运行时校验，前端同步下发用于即时反馈） */
  pattern?: string;
  placeholder?: string;
  /** 表单项辅助说明 */
  help?: string;
  /** 表格列宽提示（原样下发） */
  width?: number | string;
  /** 表单缺省值 */
  defaultValue?: unknown;
}

/** 请求上下文：钩子内可获取操作者与租户（底座 ALS 同源） */
export interface CrudRequestContext {
  actor: { id: string; username: string; roles: string[] };
  /** 来自 X-Tenant-Id 的租户上下文；未携带为 null */
  tenantId: string | null;
}

/**
 * 生命周期钩子（全部可选）：业务在不触碰引擎的前提下注入领域规则
 * （租户注入、软删除、关联校验、事件通知等）。
 * 约定：钩子内抛出 BizException 将按统一响应出口返回。
 */
export interface CrudHooks {
  /** 创建前：可补全/改写数据（返回值作为最终写入数据） */
  beforeCreate?(
    data: Record<string, unknown>,
    ctx: CrudRequestContext,
  ): Promise<Record<string, unknown>> | Record<string, unknown>;
  /** 更新前：可补全/改写增量（返回值作为最终写入数据） */
  beforeUpdate?(
    id: string,
    data: Record<string, unknown>,
    ctx: CrudRequestContext,
  ): Promise<Record<string, unknown>> | Record<string, unknown>;
  /** 删除前：如有关联引用则抛 BizException 阻断 */
  beforeDelete?(id: string, ctx: CrudRequestContext): Promise<void> | void;
  /** 创建后：领域事件/索引/统计等副作用 */
  afterCreate?(row: Record<string, unknown>, ctx: CrudRequestContext): Promise<void> | void;
  /** 更新后 */
  afterUpdate?(row: Record<string, unknown>, ctx: CrudRequestContext): Promise<void> | void;
}

/**
 * 实体定义：通用 CRUD 引擎的注册单元（一个业务实体一份定义）。
 * 权限码约定： Crud<resource>:list|create|update|delete
 * （permissionPrefix 可覆盖，如 demo:product）。
 */
export interface CrudEntityDefinition {
  /** 资源标识 = 路由段：/admin/crud/:resource；全小写字母/数字/中划线 */
  resource: string;
  /** Prisma model 名（客户端 delegate 属性，如 demoProduct） */
  model: string;
  title: string;
  description?: string;
  /** 端点权限码前缀，缺省 crud:<resource> */
  permissionPrefix?: string;
  /** 只读资源：仅暴露 schema/list/detail，写端点返回 33404 */
  readOnly?: boolean;
  /** 全局过滤条件（如软删除 { deletedAt: null }），与用户筛选叠加 */
  baseWhere?: Record<string, unknown>;
  /** 缺省排序字段（须为某 field 的 key 且 sortable），缺省 createdAt */
  defaultSort?: string;
  /** 表格/表单字段元数据（≥1 项） */
  fields: CrudFieldSchema[];
  hooks?: CrudHooks;
}

/** 注册表摘要项：GET /admin/crud/_registry 返回（前端动态工作台/菜单生成用） */
export interface CrudResourceSummary {
  resource: string;
  model: string;
  title: string;
  description: string | null;
  permissionPrefix: string;
  readOnly: boolean;
}