import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma 服务：全局唯一客户端实例。
 * - DATABASE_URL 缺省时回退本地 SQLite（开发零配置）；生产环境由 env.validation 强制显式配置；
 * - 生命周期：随模块初始化连接、随应用停机关闭（main.ts enableShutdownHooks → onModuleDestroy）。
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      datasources: { db: { url: process.env.DATABASE_URL ?? 'file:./dev.db' } },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
