import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * create-biz-app：业务项目脚手架（P4 治理项，架构文档 §7）。
 * 以 templates/biz-app 为蓝本生成业务工程：占位符替换 + 复制核心 prisma 片段。
 *
 * 用法：
 *   pnpm create:biz-app <目标目录> [--name <包名>] [--port <端口>] [--registry <私源地址>]
 * 示例：
 *   pnpm create:biz-app ../order-service --name @myorg/order-service --port 3100 \
 *     --registry https://npm.example.com/
 */
interface ScaffoldArgs {
  target: string;
  name: string | undefined;
  port: string;
  registry: string | undefined;
}

function parseArgs(argv: string[]): ScaffoldArgs {
  const read = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  return {
    target: argv[0] ?? '',
    name: read('--name'),
    port: read('--port') ?? '3100',
    registry: read('--registry'),
  };
}

/** 逐文件占位符替换（split/join 规避 $ 特殊字符的 replace 语义） */
function replaceInFile(file: string, pairs: Array<[string, string]>): void {
  let content = readFileSync(file, 'utf8');
  for (const [from, to] of pairs) content = content.split(from).join(to);
  writeFileSync(file, content, 'utf8');
}

function main(): void {
  const { target, name, port, registry } = parseArgs(process.argv.slice(2));
  if (target === '') {
    console.error(
      '用法: pnpm create:biz-app <目标目录> [--name <包名>] [--port <端口>] [--registry <私源地址>]',
    );
    process.exit(1);
  }

  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const targetDir = resolve(target);
  if (existsSync(targetDir)) {
    console.error(`目标目录已存在: ${targetDir}`);
    process.exit(1);
  }

  const pkgName = name ?? targetDir.split(/[\\/]/).pop() ?? 'biz-app';
  cpSync(join(repoRoot, 'templates', 'biz-app'), targetDir, { recursive: true });

  const replacements: Array<[string, string]> = [
    ['__NAME__', pkgName],
    ['__PORT__', port],
  ];
  for (const file of ['package.json', 'src/app.module.ts', 'README.md']) {
    replaceInFile(join(targetDir, file), replacements);
  }
  if (registry !== undefined) {
    replaceInFile(join(targetDir, '.npmrc'), [['https://registry.example.com/', registry]]);
  }

  // 核心 prisma 片段复制进业务 prisma 目录（目录模式多文件自动合并）
  cpSync(
    join(repoRoot, 'prisma', 'fragments', 'foundation.prisma'),
    join(targetDir, 'prisma', 'foundation.prisma'),
  );

  // .env 由 .env.example 生成（模板的 .env 被 gitignore，不入库）
  if (!existsSync(join(targetDir, '.env'))) {
    cpSync(join(repoRoot, 'templates', 'biz-app', '.env.example'), join(targetDir, '.env'));
  }

  console.log(`\n✓ 业务项目已生成: ${targetDir}（包名 ${pkgName}，端口 ${port}）`);
  console.log('后续步骤:');
  console.log(`  cd ${target}`);
  console.log('  pnpm install');
  console.log('  pnpm exec prisma generate && pnpm exec prisma db push');
  console.log('  pnpm build && pnpm start    # 探针 /api/v1/health、Swagger /docs');
}

main();
