import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { ErrorCode } from '../common/error-codes';
import { BizException } from '../common/exceptions/biz.exception';
import { PrismaService } from '../infra/database/prisma.service';

/**
 * 健康探针（@Public() 豁免全局鉴权）：
 *  - GET /api/v1/health       存活探针（liveness）：进程可达即返回，不触达外部依赖；
 *  - GET /api/v1/health/ready 就绪探针（readiness）：执行 SELECT 1 校验数据库连通，
 *    失败抛 50002（依赖服务不可用），供负载均衡/编排层摘除实例。
 */
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  check(): { status: string; uptime: number; timestamp: number } {
    return { status: 'up', uptime: Math.round(process.uptime()), timestamp: Date.now() };
  }

  @Get('ready')
  async ready(): Promise<{ status: string; database: string; timestamp: number }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new BizException(ErrorCode.DEPENDENCY_UNAVAILABLE, '数据库不可用');
    }
    return { status: 'ok', database: 'up', timestamp: Date.now() };
  }
}
