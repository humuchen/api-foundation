// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

/**
 * ESLint 平面配置（flat config）。
 *
 * 分层策略（与 docs/api-foundation-plan.md 的底座纪律一致）：
 *   1. 基线层：@eslint/js 推荐 + typescript-eslint 推荐（全仓库 TS 生效）
 *   2. 类型感知层：基于 projectService（覆盖 tsconfig.json include 的全部文件），
 *      启用 Promise 误用与 unsafe 系列规则 —— NestJS 异步链路的主要事故源
 *   3. 全局纪律层：禁止裸 console（src 走 pino）、强制 eqeqeq/prefer-const
 *   4. ★ 底座强制层：src/common 与 src/infra 为横切契约代码，函数返回类型必须显式声明
 *   5. 豁免层：scripts/vitest.config（Node 环境、console 放行）、测试文件（mock 场景放宽）
 */
export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'prisma/**', '**/*.tsbuildinfo'],
  },

  // ── 1. 基线层 ────────────────────────────────────────────────
  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  // ── 2. 类型感知层（projectService 接入主 tsconfig 项目） ──────
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Promise 误用：未 await 的异步调用、异步函数传入同步回调（Express 中间件场景）
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
      '@typescript-eslint/await-thenable': 'error',
      // unsafe 系列：绕过 strict 类型系统的漏洞面
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      // 未使用变量：允许下划线前缀占位（Nest 参数装饰器注入等场景）
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },

  // ── 3. 全局纪律层 ────────────────────────────────────────────
  {
    files: ['**/*.ts'],
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error',
      'object-shorthand': ['error', 'properties'],
    },
  },

  // ── 4. ★ 底座强制层（横切契约代码，最高标准） ─────────────────
  {
    files: ['src/common/**/*.ts', 'src/infra/**/*.ts'],
    rules: {
      // 底座函数签名即契约：返回类型必须显式（表达式内联场景豁免）
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        { allowExpressions: true, allowTypedFunctionExpressions: true, allowIIFEs: true },
      ],
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },

  // ── 5. 豁免层 ────────────────────────────────────────────────
  {
    // 脚本与构建配置：Node 环境，console 属正常输出通道
    files: ['scripts/**/*.ts', 'vitest.config.ts'],
    languageOptions: { globals: globals.node },
    rules: { 'no-console': 'off' },
  },
  {
    // 测试文件：mock/断言场景允许 any 与 unsafe 访问，其余纪律不变
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      'no-console': 'off',
    },
  },
  {
    files: ['eslint.config.mjs'],
    languageOptions: { globals: globals.node },
  },
);
