import { SetMetadata, type CustomDecorator } from '@nestjs/common';
import { AUDIT_KEY } from '../constants/metadata.constants';

export interface AuditMeta {
  /** 审计动作标识，约定 <模块>:<动作>，如 user:create */
  action: string;
  /** 是否记录入参摘要（记录前强制脱敏） */
  includeBody: boolean;
}

/**
 * 审计埋点：标注需要审计的写操作端点，由全局 AuditInterceptor 异步记录。
 * 用法：@Audit('user:create', { includeBody: true })
 */
export const Audit = (
  action: string,
  options?: { includeBody?: boolean },
): CustomDecorator<string> =>
  SetMetadata(AUDIT_KEY, { action, includeBody: options?.includeBody ?? false } satisfies AuditMeta);
