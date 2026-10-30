import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** 路径参数 id 的统一校验（UUID 格式） */
export class IdParamDto {
  @ApiProperty({ format: 'uuid', description: '资源 ID' })
  @IsUUID('all', { message: 'id 须为合法 UUID' })
  id!: string;
}
