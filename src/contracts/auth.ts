/**
 * SPI 契约：认证用户形态。
 * req.user 的类型（JwtStrategy.validate 返回值；只保留安全字段，不透传 payload 原文）。
 * 业务侧经 @CurrentUser() 取用时即本类型；由 common 的装饰器/守卫引用。
 */
export interface AuthUser {
  id: string;
  username: string;
  roles: string[];
  /** 当前凭证 JWT ID（登出吊销用） */
  jti: string;
  /** 当前凭证过期时间（秒级 Unix 时间戳；黑名单 TTL 依据） */
  exp: number;
}
