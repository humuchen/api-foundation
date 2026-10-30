import { IsOptional, IsString, MaxLength } from 'class-validator';

/** GET /api/v1/hello 查询参数：由全局 ValidationPipe 校验，失败返回 10001 + 字段明细 */
export class HelloQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'name 最长 50 个字符' })
  name?: string;
}
