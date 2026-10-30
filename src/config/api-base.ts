import { INestApplication, VersioningType } from '@nestjs/common';

/**
 * API 基础形态的唯一配置点（main.ts 与 openapi 导出脚本共用）：
 *  - 全局前缀 'api' + URI 版本化（默认 v1）→ 实际路径 /api/v1/*（与历史版本兼容）；
 *  - 新版本端点以 @Controller({ version: '2' }) 并行发布 → /api/v2/*。
 */
export function configureApiBase(app: INestApplication, globalPrefix: string): void {
  app.setGlobalPrefix(globalPrefix);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
}
