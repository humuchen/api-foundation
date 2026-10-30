import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';

/**
 * 存活探针：GET /api/v1/health。
 * P1 引入全局 JwtAuthGuard 后，因 @Public() 元数据自动豁免鉴权。
 */
@Public()
@Controller('health')
export class HealthController {
  @Get()
  check(): { status: string; uptime: number; timestamp: number } {
    return { status: 'up', uptime: Math.round(process.uptime()), timestamp: Date.now() };
  }
}
