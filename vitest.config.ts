import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * 测试配置（Vitest + SWC）。
 * 选型说明：@nestjs/common 12 为 ESM-only 包，Jest 无法 require；
 * Vitest 原生 ESM 直连，SWC 提供 Nest DI 所需的 emitDecoratorMetadata。
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: 'es2021',
      },
    }),
  ],
});
