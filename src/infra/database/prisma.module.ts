import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** 全局数据层模块：导出 PrismaService 供各仓储注入 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
