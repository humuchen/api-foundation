/**
 * 自定义 SetMetadata key 集中管理，避免魔法字符串散落各处。
 * 对应装饰器：public(P0) / roles(P1) / audit(P2)。
 */
export const PUBLIC_KEY = 'foundation:isPublic';
export const ROLES_KEY = 'foundation:roles';
export const AUDIT_KEY = 'foundation:audit';
