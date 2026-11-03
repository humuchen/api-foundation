/**
 * SPI 契约出口：核心包扩展点的唯一入口。
 * 业务项目只 import 本目录定义的 Token 与接口，不触碰 infra 内部实现。
 * 新增扩展点时在此追加 Token + 接口，并在对应基建模块绑定默认实现。
 */
export { AUDIT_SINK } from './audit-sink.js';
export type { AuditEntry, AuditSink } from './audit-sink.js';
export type { AuthUser } from './auth.js';
