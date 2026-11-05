import type { CrudEntityDefinition, CrudFieldSchema } from '../admin.contracts.js';

/** 校验明细：与全局 ValidationPipe 的 BizException(10001) 明细结构对齐 */
export interface FieldViolation {
  field: string;
  message: string;
}

export interface ValidateResult {
  /** 清洗后的写入数据（类型收敛 + 缺省补全 + 只读剥离 + null 丢弃） */
  data: Record<string, unknown>;
  /** 校验失败明细（非空 = 整体失败，data 不可用） */
  violations: FieldViolation[];
  /** 须异步字典校验的 [字段, 字典编码] 列表（由 CrudService 调 DictService 完成） */
  dictChecks: Array<{ field: string; dictType: string }>;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/**
 * 通用 CRUD 运行时校验器（同步部分）：实体定义驱动的入参清洗与校验。
 *
 * 规则约定：
 *  - 白名单：仅声明字段（inForm !== false）可写入；未知字段按校验失败拒绝（与全局
 *    ValidationPipe forbidNonWhitelisted 同语义）；
 *  - create：required 字段缺失 → 失败；可选字段缺省应用 defaultValue；
 *  - update：部分更新语义（缺省 = 不改）；readOnly 字段静默剥离（前端整表单回传友好）；
 *  - null：非必填字段按「未提供」处理（丢弃，不猜测列可空性）；必填字段传 null → 失败；
 *  - 类型收敛：number/integer/boolean 接受常见字符串形态（表单序列化友好），失败即校验错误；
 *  - enum/dict：enum 与静态选项精确匹配；dict 仅检查形态，值合法性由 DictService 异步校验。
 */
export function validateCrudData(
  definition: CrudEntityDefinition,
  input: Record<string, unknown>,
  mode: 'create' | 'update',
): ValidateResult {
  const violations: FieldViolation[] = [];
  const dictChecks: Array<{ field: string; dictType: string }> = [];
  const data: Record<string, unknown> = {};

  const declared = new Map(definition.fields.map((f) => [f.key, f] as const));

  // 未知字段拒绝（白名单语义）
  for (const key of Object.keys(input)) {
    const field = declared.get(key);
    if (!field || field.inForm === false) {
      violations.push({ field: key, message: '未声明的字段' });
    }
  }

  for (const field of definition.fields) {
    if (field.inForm === false) continue;
    const present = Object.prototype.hasOwnProperty.call(input, field.key);
    const raw = input[field.key];

    // 只读字段：update 静默剥离（前端整表单回传），create 视为未提供
    if (field.readOnly && mode === 'update') continue;

    if (!present || raw === undefined) {
      if (mode === 'create') {
        if (field.required) {
          violations.push({ field: field.key, message: `${field.label} 为必填项` });
          continue;
        }
        if (field.defaultValue !== undefined) data[field.key] = field.defaultValue;
      }
      continue;
    }
    if (raw === null) {
      if (field.required) {
        violations.push({ field: field.key, message: `${field.label} 为必填项` });
      }
      continue; // 非必填 null 按「未提供」处理
    }

    const checked = checkField(field, raw, violations);
    if (checked.ok) {
      data[field.key] = checked.value;
      if (field.type === 'dict') {
        dictChecks.push({ field: field.key, dictType: field.dictType ?? '' });
      }
    }
  }

  return { data, violations, dictChecks };
}

function checkField(
  field: CrudFieldSchema,
  raw: unknown,
  violations: FieldViolation[],
): { ok: boolean; value?: unknown } {
  const fail = (message: string): { ok: false; value: undefined } => {
    violations.push({ field: field.key, message });
    return { ok: false, value: undefined };
  };

  switch (field.type) {
    case 'string':
    case 'text': {
      const value = typeof raw === 'string' ? raw : typeof raw === 'number' || typeof raw === 'boolean' ? String(raw) : null;
      if (value === null) return fail(`${field.label} 须为字符串`);
      if (field.maxLength !== undefined && value.length > field.maxLength) {
        return fail(`${field.label} 长度不能超过 ${field.maxLength}`);
      }
      if (field.pattern) {
        const re = safeRegExp(field.pattern);
        if (re && !re.test(value)) {
          return fail(`${field.label} 格式不正确${field.help ? `：${field.help}` : ''}`);
        }
      }
      return { ok: true, value };
    }
    case 'number':
    case 'integer': {
      const num = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : Number.NaN;
      if (Number.isNaN(num)) return fail(`${field.label} 须为数字`);
      if (field.type === 'integer' && !Number.isInteger(num)) return fail(`${field.label} 须为整数`);
      if (field.min !== undefined && num < field.min) return fail(`${field.label} 不能小于 ${field.min}`);
      if (field.max !== undefined && num > field.max) return fail(`${field.label} 不能大于 ${field.max}`);
      return { ok: true, value: num };
    }
    case 'boolean': {
      if (typeof raw === 'boolean') return { ok: true, value: raw };
      if (raw === 'true' || raw === 1 || raw === '1') return { ok: true, value: true };
      if (raw === 'false' || raw === 0 || raw === '0') return { ok: true, value: false };
      return fail(`${field.label} 须为布尔值`);
    }
    case 'date':
    case 'datetime': {
      if (typeof raw !== 'string' || !ISO_DATE_PATTERN.test(raw)) {
        return fail(`${field.label} 须为 ISO-8601 日期${field.type === 'datetime' ? '时间' : ''}字符串`);
      }
      return { ok: true, value: raw };
    }
    case 'enum': {
      const options = field.options ?? [];
      const hit = options.some((o) => String(o.value) === String(raw));
      if (!hit) return fail(`${field.label} 不在合法选项内`);
      return { ok: true, value: raw };
    }
    case 'dict': {
      if (typeof raw !== 'string' || raw === '') return fail(`${field.label} 须为字典值字符串`);
      return { ok: true, value: raw };
    }
    case 'json': {
      return { ok: true, value: raw };
    }
    default:
      return fail(`${field.label} 字段类型非法`);
  }
}

/** 正则约束失败不阻断服务（回退为无约束），仅运行时告警语义由定义侧保证 */
function safeRegExp(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}
