import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class AuditQueryDto {
  @ApiProperty({ minimum: 1, maximum: 100, default: 20, description: '返回最近 N 条' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
