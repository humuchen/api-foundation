import type { Provider } from '@nestjs/common';

/**
 * forRoot 配置覆盖（L1 扩展点）：
 * 与 config/configuration.ts 同构的局部对象，作为附加 load 工厂交由 @nestjs/config 合并，
 * 供 configService.get('app.port') 等既有键位读取。
 */
export type FoundationConfigOverride = Record<string, unknown>;

/** L2 扩展点：DI 替换集合。按 provide Token 路由到对应基建模块（同 Token 后注册者生效） */
export type FoundationReplacements = Provider[];

export interface FoundationOptions {
  /** 配置覆盖：键位与 configuration.ts 对齐（如 { app: { port: 4000 } }） */
  config?: FoundationConfigOverride;
  /** DI 替换：对象式 Provider（{ provide: AUDIT_SINK, useClass: MySink }）；类式 Provider 无法路由 */
  replacements?: FoundationReplacements;
}

export interface FoundationBootstrapOptions {
  /** 监听端口；缺省读 config app.port（env PORT），再缺省 3000 */
  port?: number;
  /** 全局前缀；缺省读 config app.globalPrefix（env GLOBAL_PREFIX），再缺省 api */
  globalPrefix?: string;
  /** 是否挂载 Swagger（/docs 与 /docs-json）；缺省开启，生产可关闭 */
  swagger?: boolean;
}
