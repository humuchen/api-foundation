/** 凭证类型：access 用于业务接口；refresh 仅用于换取新凭证对 */
export type TokenType = 'access' | 'refresh';

/** JWT 载荷（签发侧；jsonwebtoken 校验时额外注入 iat/exp/jti 标准声明） */
export interface JwtPayload {
  /** 用户 ID */
  sub: string;
  username: string;
  roles: string[];
  typ: TokenType;
  /** JWT ID：唯一标识，用于轮换与吊销（黑名单） */
  jti: string;
}

/** 校验侧载荷（jsonwebtoken 注入标准声明后的完整形态） */
export interface VerifiedJwtPayload extends JwtPayload {
  /** 过期时间（秒级 Unix 时间戳） */
  exp: number;
  iat?: number;
}

/** req.user 形态：定义已上移 contracts（SPI 契约），此处再导出保持既有导入路径兼容 */
export type { AuthUser } from '../../contracts/auth.js';

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
