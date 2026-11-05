import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ADMIN_CODE_PATTERN } from '../rbac/rbac.dto.js';

export class CreateDictTypeDto {
  @ApiProperty({ example: 'demo_category', description: '字典编码（唯一，业务引用键）' })
  @IsString()
  @Matches(ADMIN_CODE_PATTERN, { message: 'code 须为字母开头的 2-32 位字母/数字/下划线/中划线' })
  code!: string;

  @ApiProperty({ example: '商品分类', description: '字典名称' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;

  @ApiPropertyOptional({ description: '字典描述' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
}

export class UpdateDictTypeDto {
  @ApiPropertyOptional({ description: '字典名称' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name?: string;

  @ApiPropertyOptional({ description: '字典描述' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
}

export class CreateDictItemDto {
  @ApiProperty({ example: 'electronics', description: '字典项值（类型内唯一，写入业务数据）' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  value!: string;

  @ApiProperty({ example: '数码', description: '字典项标签（展示用）' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  label!: string;

  @ApiPropertyOptional({ default: 0, description: '排序权重（小者在前）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort?: number;

  @ApiPropertyOptional({ default: false, description: '是否停用' })
  @IsOptional()
  @IsBoolean()
  disabled?: boolean;

  @ApiPropertyOptional({ type: Object, description: '扩展信息（如国际化键/颜色/图标）' })
  @IsOptional()
  @IsObject()
  extra?: Record<string, unknown>;
}

export class UpdateDictItemDto {
  @ApiPropertyOptional({ description: '字典项标签' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  label?: string;

  @ApiPropertyOptional({ description: '排序权重' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort?: number;

  @ApiPropertyOptional({ description: '是否停用' })
  @IsOptional()
  @IsBoolean()
  disabled?: boolean;

  @ApiPropertyOptional({ type: Object, description: '扩展信息' })
  @IsOptional()
  @IsObject()
  extra?: Record<string, unknown>;
}
