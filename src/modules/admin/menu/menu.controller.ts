import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Audit } from '../../../common/decorators/audit.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { IdParamDto } from '../../../common/dto/id-param.dto.js';
import type { AuthUser } from '../../../contracts/index.js';
import { CreateMenuDto, UpdateMenuDto } from './menu.dto.js';
import type { MenuEntity, MenuNode } from './menu.repository.js';
import { MenuService } from './menu.service.js';
import { RequirePerm } from '../rbac/perm.decorator.js';

/**
 * 菜单与动态路由：管理端维护全量树；登录用户经 /my 拉取可见树生成动态路由。
 * 路由声明顺序：/tree 与 /my 静态段先于 /:id。
 */
@ApiTags('admin/menus')
@ApiBearerAuth()
@Controller('admin/menus')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Get('tree')
  @RequirePerm('admin:menu:list')
  @ApiOperation({ summary: '全量菜单树（admin:menu:list；管理端维护视图）' })
  tree(): Promise<MenuNode[]> {
    return this.menuService.listTree();
  }

  @Get('my')
  @ApiOperation({ summary: '我的可见菜单树（任意登录用户；前端动态路由数据源）' })
  myTree(@CurrentUser() user: AuthUser): Promise<MenuNode[]> {
    return this.menuService.visibleTreeFor(user);
  }

  @Post()
  @RequirePerm('admin:menu:create')
  @Audit('admin:menu:create', { includeBody: true })
  @ApiOperation({ summary: '创建菜单（admin:menu:create）' })
  create(@Body() dto: CreateMenuDto): Promise<MenuEntity> {
    return this.menuService.createMenu(dto);
  }

  @Patch(':id')
  @RequirePerm('admin:menu:update')
  @Audit('admin:menu:update', { includeBody: true })
  @ApiOperation({ summary: '更新菜单（admin:menu:update；内置菜单可改展示信息）' })
  update(@Param() params: IdParamDto, @Body() dto: UpdateMenuDto): Promise<MenuEntity> {
    return this.menuService.updateMenu(params.id, dto);
  }

  @Delete(':id')
  @RequirePerm('admin:menu:delete')
  @Audit('admin:menu:delete')
  @ApiOperation({ summary: '删除菜单（admin:menu:delete；内置菜单与含子级菜单拒绝）' })
  remove(@Param() params: IdParamDto): Promise<{ id: string }> {
    return this.menuService.deleteMenu(params.id);
  }
}
