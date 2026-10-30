import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

/**
 * 通用分页查询参数：query → DTO 由全局 ValidationPipe 转换校验（@Type 负责数字转换）。
 * sort 仅做格式约束；可排序字段白名单由 toQueryOptions 的调用方按实体声明（防排序注入）。
 */
export class PaginationDto {
  @ApiProperty({ minimum: 1, default: 1, description: '页码（从 1 开始）' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiProperty({ minimum: 1, maximum: 100, default: 20, description: '每页条数（上限 100）' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100, { message: 'pageSize 单页上限 100' })
  pageSize: number = 20;

  @ApiPropertyOptional({
    description: '排序，格式 field:asc|desc，如 createdAt:desc；可排序字段见各模块白名单',
    example: 'createdAt:desc',
  })
  @IsOptional()
  @Matches(/^\S+:(asc|desc)$/, { message: 'sort 格式须为 field:asc 或 field:desc' })
  sort?: string;
}
