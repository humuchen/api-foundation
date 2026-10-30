import { SetMetadata } from '@nestjs/common';
import { PUBLIC_KEY } from '../constants/metadata.constants';

/**
 * 标记端点为公开资源（如 /health、/auth/login）。
 * P1 阶段由全局 JwtAuthGuard 读取该元数据并豁免鉴权；P0 阶段仅作为意图声明。
 */
export const Public = () => SetMetadata(PUBLIC_KEY, true);
