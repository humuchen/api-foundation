import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

/** OpenAPI 文档构建的唯一配置点（main.ts 的 /docs 与导出脚本共用，防止漂移） */
export function buildOpenapiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('NestJS v12 通用接口底座')
    .setDescription(
      '统一响应/错误码/参数校验/JWT 鉴权/RBAC/分页/审计/限流/幂等/缓存契约演示。' +
        '全站默认需登录（@Public 白名单除外）：先调 POST /auth/login 获取凭证对，' +
        '点右上角 Authorize 填入 accessToken。' +
        '内置账号：admin/admin123（admin）、ops/ops123456（ops）、demo/demo123456（user）。' +
        'URI 版本化：/api/v1/* 稳定契约，/api/v2/* 演示并行版本。',
    )
    .setVersion('0.4.0')
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, config);
}
