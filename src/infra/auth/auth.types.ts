/** 凭证类型：access 用于业务接口；refresh 仅用于换取新凭证对 */
export type TokenType = 'access' | 'refresh';

/** JWT 载荷（签发与解析的共享契约） */
export interface JwtPayload {
  /** 用户 ID */
  sub: string;
  username: string;
  roles: string[];
  typ: TokenType;
}

/** req.user 形态（JwtStrategy.validate 返回值；只保留安全字段，不透传 payload 原文） */
export interface AuthUser {
  id: string;
  username: string;
  roles: string[];
}

/** 登录/刷新结果：双凭证（access 短效 + refresh 长效） */
export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  /** access 有效期（原始字符串，如 '2h'） */
  expiresIn: string;
  /** refresh 有效期（如 '7d'） */
  refreshExpiresIn: string;
}
