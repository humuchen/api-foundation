import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

/** 菜单类型：directory=目录（聚合子菜单） menu=页面菜单 */
export const MENU_TYPES = ['directory', 'menu'] as const;

/** 前端路由路径约定：以 / 开头的站内绝对路径 */
export const MENU_PATH_PATTERN = /^\/[a-zA-Z0-9/_.-]*$/;

export class CreateMenuDto {
  @ApiPropertyOptional({ format: 'uuid', description: '父级菜单 ID（缺省 = 顶级）' })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9a-fA-F-]{36}$/, { message: 'parentId 须为合法 UUID' })
  parentId?: string;

  @ApiProperty({ example: '角色管理', description: '菜单名称' })
  @IsString()
  @MaxLength(50)
  name!: string;

  @ApiProperty({ example: '/system/roles', description: '路由路径（站内唯一，/ 开头）' })
  @IsString()
  @Matches(MENU_PATH_PATTERN, { message: 'path 须为 / 开头的站内路径' })
  @MaxLength(200)
  path!: string;

  @ApiPropertyOptional({ example: 'admin/RoleList', description: '前端组件标识（渲染器按此懒加载页面）' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  component?: string;

  @ApiPropertyOptional({ description: '图标标识' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @ApiPropertyOptional({ default: 0, description: '排序权重（小者在前）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort?: number;

  @ApiPropertyOptional({ enum: [...MENU_TYPES], default: 'menu', description: '菜单类型' })
  @IsOptional()
  @IsIn([...MENU_TYPES], { message: 'type 非法' })
  type?: string;

  @ApiPropertyOptional({
    example: 'admin:role:list',
    description: '可见性权限码（缺省 = 登录即可见；置值则需权限集合包含）',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  permCode?: string;

  @ApiPropertyOptional({ default: true, description: '是否在导航中显示' })
  @IsOptional()
  @IsBoolean()
  visible?: boolean;

  @ApiPropertyOptional({
    type: Object,
    example: { title: '角色管理', keepAlive: true, layout: 'sidebar' },
    description: '路由元信息（title/keepAlive/layout/theme 等，原样下发前端生成动态路由）',
  })
  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;
}

export class UpdateMenuDto {
  @ApiPropertyOptional({ description: '父级菜单 ID' })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9a-fA-F-]{36}$/, { message: 'parentId 须为合法 UUID' })
  parentId?: string;

  @ApiPropertyOptional({ description: '菜单名称' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @ApiPropertyOptional({ description: '路由路径' })
  @IsOptional()
  @IsString()
  @Matches(MENU_PATH_PATTERN, { message: 'path 须为 / 开头的站内路径' })
  @MaxLength(200)
  path?: string;

  @ApiPropertyOptional({ description: '前端组件标识' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  component?: string;

  @ApiPropertyOptional({ description: '图标标识' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @ApiPropertyOptional({ description: '排序权重' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort?: number;

  @ApiPropertyOptional({ enum: [...MENU_TYPES], description: '菜单类型' })
  @IsOptional()
  @IsIn([...MENU_TYPES], { message: 'type 非法' })
  type?: string;

  @ApiPropertyOptional({ description: '可见性权限码' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  permCode?: string;

  @ApiPropertyOptional({ description: '是否在导航中显示' })
  @IsOptional()
  @IsBoolean()
  visible?: boolean;

  @ApiPropertyOptional({ type: Object, description: '路由元信息' })
  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;
}
