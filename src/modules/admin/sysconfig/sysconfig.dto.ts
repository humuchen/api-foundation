import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDefined, IsObject, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ADMIN_CODE_PATTERN } from '../rbac/rbac.dto.js';

/** 配置键约定：小写字母开头的点分命名（组.键），如 ui.theme / sys.siteName */
export const CONFIG_KEY_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;

export class CreateSysConfigDto {
  @ApiProperty({ example: 'brand.logo', description: '配置键（唯一，点分命名：组.键）' })
  @IsString()
  @Matches(CONFIG_KEY_PATTERN, { message: 'key 须为点分命名（如 ui.theme）' })
  @MaxLength(100)
  key!: string;

  @ApiProperty({ example: 'brand', description: '分组（ui 组为前端主题/布局保留组）' })
  @IsString()
  @Matches(ADMIN_CODE_PATTERN, { message: 'group 须为 2-32 位字母/数字/下划线/中划线' })
  group!: string;

  @ApiProperty({ type: Object, example: { primary: '#4f6ef2', mode: 'light' }, description: '配置值（任意 JSON）' })
  @IsDefined()
  @IsObject()
  value!: Record<string, unknown>;

  @ApiPropertyOptional({ description: '配置描述' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
}

export class UpdateSysConfigDto {
  @ApiProperty({ type: Object, description: '配置值（任意 JSON，全量替换）' })
  @IsDefined()
  @IsObject()
  value!: Record<string, unknown>;
}
