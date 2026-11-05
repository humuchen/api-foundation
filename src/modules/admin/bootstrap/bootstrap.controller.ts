import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../../contracts/index.js';
import { AdminBootstrapService, type AdminBootstrapVo } from './bootstrap.service.js';

/** 后台启动聚合端点：任意登录用户（菜单/权限按身份过滤后返回） */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminBootstrapController {
  constructor(private readonly bootstrapService: AdminBootstrapService) {}

  @Get('bootstrap')
  @ApiOperation({ summary: '后台启动上下文（用户/权限码/可见菜单树/ui 主题布局，一次拉取）' })
  bootstrap(@CurrentUser() user: AuthUser): Promise<AdminBootstrapVo> {
    return this.bootstrapService.forActor(user);
  }
}
