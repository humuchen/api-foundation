import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export const USER_ROLES = ['admin', 'ops', 'user'] as const;

export class UserQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: '模糊匹配 username / nickname' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  keyword?: string;

  @ApiPropertyOptional({ enum: [...USER_ROLES], description: '按角色过滤' })
  @IsOptional()
  @IsIn([...USER_ROLES], { message: 'role 含非法角色' })
  role?: string;
}

export class CreateUserDto {
  @ApiProperty({ example: 'newuser', description: '3-32 位字母/数字/下划线' })
  @IsString()
  @Matches(/^[a-zA-Z0-9_]{3,32}$/, { message: 'username 须为 3-32 位字母/数字/下划线' })
  username!: string;

  @ApiProperty({ minLength: 6, description: '密码（6-64 位）' })
  @IsString()
  @MinLength(6, { message: 'password 至少 6 位' })
  @MaxLength(64)
  password!: string;

  @ApiPropertyOptional({ description: '昵称，缺省取 username' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  nickname?: string;

  @ApiProperty({ enum: [...USER_ROLES], example: ['user'] })
  @IsArray()
  @ArrayNotEmpty({ message: 'roles 不能为空' })
  @ArrayUnique()
  @IsIn([...USER_ROLES], { each: true, message: 'roles 含非法角色' })
  roles!: string[];
}

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  nickname?: string;

  @ApiPropertyOptional({ enum: [...USER_ROLES] })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty({ message: 'roles 不能为空' })
  @ArrayUnique()
  @IsIn([...USER_ROLES], { each: true, message: 'roles 含非法角色' })
  roles?: string[];
}
