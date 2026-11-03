# Changesets 变更记录

发版工作流（详见 docs/core-package-architecture.md §4）：

1. 特性 PR 中执行 `pnpm changeset`，选择 bump 级别（MAJOR/MINOR/PATCH）并撰写变更说明，
   生成的 `.changeset/*.md` 随 PR 提交（PR 模板强制项）。
2. 合并 `main` 后执行 `pnpm changeset:version`：聚合全部 changeset，更新版本号与 CHANGELOG.md，
   生成 Version PR。
3. 批准合并 Version PR 后执行 `pnpm changeset:publish` 发布到 `publishConfig.registry`
   指向的私有源（发布前改为实际私源地址），并打 git tag。

预发布通道：`pnpm changeset pre enter beta` → 版本号进入 `1.x.0-beta.N`；
`pnpm changeset pre exit` 退出并回归正式版本。
