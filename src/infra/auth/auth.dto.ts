import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin', description: '用户名' })
  @IsString()
  @IsNotEmpty({ message: 'username 不能为空' })
  @MaxLength(32)
  username!: string;

  @ApiProperty({ example: 'admin123', minLength: 6, description: '密码' })
  @IsString()
  @MinLength(6, { message: 'password 至少 6 位' })
  @MaxLength(64)
  password!: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: '登录时签发的 refreshToken' })
  @IsString()
  @IsNotEmpty({ message: 'refreshToken 不能为空' })
  refreshToken!: string;
}

export class LogoutDto {
  @ApiPropertyOptional({
    description: '可选：同时吊销该 refreshToken（登出全设备时传入）',
    type: String,
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
