import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { ErrorCode } from '../../common/error-codes';
import { BizException } from '../../common/exceptions/biz.exception';
import { UserVo, UserService } from '../../modules/user/user.service';
import type { LoginDto, RefreshTokenDto } from './auth.dto';
import type { JwtPayload, LoginResult, TokenType } from './auth.types';

/**
 * 认证服务：凭证校验委托给用户域（UserService.verifyCredentials，失败抛 20001/20004）。
 * 双凭证模型：access（短效，typ=access）+ refresh（长效，typ=refresh，用于换取新对）；
 * refresh 为自包含校验（无服务端会话状态），接入登出黑名单/设备管理时再增加存储。
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly userService: UserService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResult> {
    const user: UserVo = await this.userService.verifyCredentials(dto.username, dto.password);
    return this.issueTokens(user);
  }

  /** 用 refreshToken 换取新凭证对（校验类型标记 + 用户仍有效） */
  async refresh(dto: RefreshTokenDto): Promise<LoginResult> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(dto.refreshToken);
    } catch {
      throw new BizException(ErrorCode.UNAUTHORIZED, '刷新凭证无效或已过期');
    }
    if (payload.typ !== 'refresh') {
      throw new BizException(ErrorCode.UNAUTHORIZED, '凭证类型错误');
    }
    const user: UserVo = await this.userService.findOne(payload.sub); // 不存在 → 40001
    if (user.disabled) throw new BizException(ErrorCode.ACCOUNT_DISABLED);
    return this.issueTokens(user);
  }

  private async issueTokens(user: {
    id: string;
    username: string;
    roles: string[];
  }): Promise<LoginResult> {
    const base = { sub: user.id, username: user.username, roles: user.roles };
    const withTyp = (t: TokenType): JwtPayload => ({ ...base, typ: t });
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(withTyp('access')),
      this.jwtService.signAsync(withTyp('refresh'), {
        expiresIn: this.configService.get<StringValue>('auth.refreshExpiresIn', '7d'),
      }),
    ]);
    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.configService.get<string>('auth.jwtExpiresIn', '2h'),
      refreshExpiresIn: this.configService.get<string>('auth.refreshExpiresIn', '7d'),
    };
  }
}
