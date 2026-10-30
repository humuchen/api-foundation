import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Idempotent } from '../../common/decorators/idempotent.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { IdParamDto } from '../../common/dto/id-param.dto';
import { PageVo } from '../../common/responses/page.vo';
import type { AuthUser } from '../../infra/auth/auth.types';
import { CreateUserDto, UpdateUserDto, UserQueryDto } from './user.dto';
import { UserVo, UserService } from './user.service';

/**
 * 用户管理（RBAC 参考实现）：除 /users/me 外均需 admin 角色。
 * 声明顺序注意：/users/me 必须注册在 /users/:id 之前。
 * create 为幂等端点参考实现：携带 Idempotency-Key 头重复提交不重复创建。
 */
@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  @ApiOperation({ summary: '我的信息（任意登录用户）' })
  me(@CurrentUser() user: AuthUser): Promise<UserVo> {
    return this.userService.findMe(user.id);
  }

  @Get()
  @Roles('admin')
  @ApiOperation({ summary: '分页查询用户（admin）—— 统一分页契约 + 结果缓存示例' })
  page(@Query() query: UserQueryDto): Promise<PageVo<UserVo>> {
    return this.userService.findPage(query);
  }

  @Get(':id')
  @Roles('admin')
  @ApiOperation({ summary: '用户详情（admin）' })
  detail(@Param() params: IdParamDto): Promise<UserVo> {
    return this.userService.findOne(params.id);
  }

  @Post()
  @Roles('admin')
  @Idempotent()
  @Audit('user:create', { includeBody: true })
  @ApiOperation({ summary: '创建用户（admin；支持 Idempotency-Key 幂等重放）' })
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthUser): Promise<UserVo> {
    return this.userService.create(dto, actor.username);
  }

  @Patch(':id')
  @Roles('admin')
  @Audit('user:update', { includeBody: true })
  @ApiOperation({ summary: '更新用户（admin）' })
  update(
    @Param() params: IdParamDto,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<UserVo> {
    return this.userService.update(params.id, dto, actor.username);
  }

  @Delete(':id')
  @Roles('admin')
  @Audit('user:delete')
  @ApiOperation({ summary: '删除用户（admin）' })
  remove(@Param() params: IdParamDto, @CurrentUser() actor: AuthUser): Promise<{ id: string }> {
    return this.userService.remove(params.id, actor.username);
  }
}
