import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

/** 角色/权限编码约定：字母开头，字母数字下划线中划线，2-32 位 */
export const ADMIN_CODE_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{1,31}$/;

/** 权限点类型：api=接口权限 menu=菜单可见性 button=按钮级（前端 v-perm） */
export const PERMISSION_TYPES = ['api', 'menu', 'button'] as const;

export class CreateRoleDto {
  @ApiProperty({ example: 'ecommerce-manager', description: '角色编码（唯一，创建后不可改）' })
  @IsString()
  @Matches(ADMIN_CODE_PATTERN, { message: 'code 须为字母开头的 2-32 位字母/数字/下划线/中划线' })
  code!: string;

  @ApiProperty({ example: '电商运营', description: '角色名称' })
  @IsString()
  @MaxLength(50)
  name!: string;

  @ApiPropertyOptional({ description: '角色描述' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({ default: 0, description: '排序权重（小者在前）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort?: number;

  @ApiPropertyOptional({ default: false, description: '是否禁用（禁用后其授权不再生效）' })
  @IsOptional()
  @IsBoolean()
  disabled?: boolean;
}

export class UpdateRoleDto {
  @ApiPropertyOptional({ description: '角色名称' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @ApiPropertyOptional({ description: '角色描述' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({ description: '排序权重' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort?: number;

  @ApiPropertyOptional({ description: '是否禁用' })
  @IsOptional()
  @IsBoolean()
  disabled?: boolean;
}

export class CreatePermissionDto {
  @ApiProperty({ example: 'order:refund:approve', description: '权限编码（唯一，创建后不可改）' })
  @IsString()
  @Matches(ADMIN_CODE_PATTERN, { message: 'code 须为字母开头的 2-32 位字母/数字/下划线/中划线' })
  code!: string;

  @ApiProperty({ example: '订单退款审批', description: '权限名称' })
  @IsString()
  @MaxLength(50)
  name!: string;

  @ApiProperty({ example: 'refund', description: '资源域（权限分组展示用）' })
  @IsString()
  @MaxLength(32)
  resource!: string;

  @ApiProperty({ example: 'approve', description: '动作标识' })
  @IsString()
  @MaxLength(32)
  action!: string;

  @ApiPropertyOptional({ enum: [...PERMISSION_TYPES], default: 'api', description: '权限类型' })
  @IsOptional()
  @IsIn([...PERMISSION_TYPES], { message: 'type 非法' })
  type?: string;

  @ApiPropertyOptional({ description: '权限描述' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({ default: 0, description: '排序权重' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort?: number;
}

export class GrantPermissionsDto {
  @ApiProperty({
    type: [String],
    example: ['admin:role:list', 'demo:product:create'],
    description: '授权权限码全集（全量替换；空数组 = 收回全部授权）',
  })
  @IsArray()
  @IsString({ each: true, message: 'permissionCodes 须为字符串数组' })
  permissionCodes!: string[];
}

export class BindUserRolesDto {
  @ApiProperty({
    type: [String],
    example: ['ops'],
    description: '绑定角色编码全集（全量替换；空数组 = 解绑全部）',
  })
  @IsArray()
  @IsString({ each: true, message: 'roleCodes 须为字符串数组' })
  roleCodes!: string[];
}

/** 用户角色绑定路径参数（userId 为 users.id，UUID） */
export class UserIdParamDto {
  @ApiProperty({ format: 'uuid', description: '用户 ID' })
  @IsString()
  @Matches(/^[0-9a-fA-F-]{36}$/, { message: 'userId 须为合法 UUID' })
  userId!: string;
}
