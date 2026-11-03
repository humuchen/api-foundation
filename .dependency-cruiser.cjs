/**
 * 依赖方向防腐规则（架构文档 §6.1）。
 * 分层（由底至顶）：contracts → common → infra/factory → apps/demo 宿主。
 * 已知耦合（白名单现状，待后续 SPI 化收敛）：infra/auth 依赖 modules/user（认证用户仓储）。
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-src-to-apps',
      comment: '依赖方向单向（apps → src）：核心包 src 不得依赖宿主应用',
      severity: 'error',
      from: { path: '^src' },
      to: { path: '^apps' },
    },
    {
      name: 'contracts-is-leaf',
      comment: 'contracts 为最底层 SPI 契约层，不得依赖 common/infra/factory/modules',
      severity: 'error',
      from: { path: '^src/contracts' },
      to: { path: '^src/(common|infra|factory|modules)' },
    },
    {
      name: 'common-no-framework-integration',
      comment: 'common 横切底座不得依赖 infra（框架集成）/factory（装配）/modules（业务参考实现）',
      severity: 'error',
      from: { path: '^src/common' },
      to: { path: '^src/(infra|factory|modules)' },
    },
    {
      name: 'infra-no-assembly',
      comment: 'infra 框架集成不得依赖 factory 装配层与宿主应用',
      severity: 'error',
      from: { path: '^src/infra' },
      to: { path: '^(src/factory|apps)' },
    },
    {
      name: 'modules-no-assembly',
      comment: 'modules 参考实现不得依赖 factory 装配层与宿主应用',
      severity: 'error',
      from: { path: '^src/modules' },
      to: { path: '^(src/factory|apps)' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
  },
};
