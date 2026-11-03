import { DynamicModule, HttpStatus, Module, ValidationPipe } from '@nestjs/common';
import type { Provider } from '@nestjs/common';
import { CacheModule, type CacheManagerOptions } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration from '../config/configuration.js';
import { validateEnv } from '../config/env.validation.js';
import { ErrorCode } from '../common/error-codes.js';
import { BizException } from '../common/exceptions/biz.exception.js';
import { AllExceptionsFilter } from '../common/filters/all-exceptions.filter.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { LoggingInterceptor } from '../common/interceptors/logging.interceptor.js';
import { TransformInterceptor } from '../common/interceptors/transform.interceptor.js';
import { AUDIT_SINK } from '../contracts/index.js';
import { AuditModule, AuditInterceptor } from '../infra/audit/index.js';
import { AuthModule } from '../infra/auth/auth.module.js';
import { PrismaModule } from '../infra/database/prisma.module.js';
import { IdempotencyInterceptor } from '../infra/idempotency/idempotency.interceptor.js';
import { LoggerModule } from '../infra/logger/index.js';
import type { FoundationOptions } from './foundation.types.js';

/** 取出 replacements 中命中指定 Token 的对象式 Provider（类式 Provider 无 Token 可路由，需以 { provide } 形式给出） */
function providersWithToken(replacements: Provider[] | undefined, token: unknown): Provider[] {
  return (replacements ?? []).filter((p) => {
    if (typeof p !== 'object' || p === null || !('provide' in p)) return false;
    return p.provide === token;
  });
}

/**
 * 底座装配模块（唯一组合根）：配置 + 限流/缓存/事件/日志/数据库/审计/认证基建 + 全局 Pipe/Guard/Filter/Interceptor。
 *
 * 底座能力经全局 Provider 注入，业务模块零感知：
 *  - APP_PIPE：全局参数校验；校验失败抛 BizException(10001, 明细)，交由过滤器统一出口
 *  - APP_GUARD：ThrottlerGuard（限流，429→50003）→ JwtAuthGuard → RolesGuard（@Public 白名单、@Roles 角色）
 *  - APP_FILTER：AllExceptionsFilter 兜底所有异常
 *  - APP_INTERCEPTOR：Logging（耗时）、Audit（审计埋点）、Idempotency（幂等重放）、Transform（响应包壳）
 *
 * 业务侧用法：
 *   @Module({ imports: [FoundationModule.forRoot(options), OrderModule] })
 *   export class AppModule {}
 */
@Module({})
export class FoundationModule {
  static forRoot(options: FoundationOptions = {}): DynamicModule {
    const configOverride = options.config;
    const replacements = options.replacements;

    const globalProviders: Provider[] = [
      {
        provide: APP_PIPE,
        useValue: new ValidationPipe({
          whitelist: true,            // 剥离 DTO 未声明属性
          forbidNonWhitelisted: true, // 未声明属性直接校验失败（不静默放行）
          transform: true,            // plain → DTO 实例，控制器拿到强类型对象
          exceptionFactory: (errors) => {
            const details = errors.flatMap((e) => {
              const constraints = e.constraints ? Object.values(e.constraints) : [];
              return constraints.map((message) => ({ field: e.property, message }));
            });
            return new BizException(
              ErrorCode.VALIDATION_FAILED,
              '参数校验失败',
              details,
              HttpStatus.BAD_REQUEST,
            );
          },
        }),
      },
      { provide: APP_GUARD, useClass: ThrottlerGuard },
      { provide: APP_GUARD, useClass: JwtAuthGuard },
      { provide: APP_GUARD, useClass: RolesGuard },
      { provide: APP_FILTER, useClass: AllExceptionsFilter },
      { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
      { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
      { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
      { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    ];

    return {
      module: FoundationModule,
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          // config 覆盖作为附加 load 工厂，注册序在默认 configuration 之后
          load: [
            configuration,
            ...(configOverride ? [(): Record<string, unknown> => configOverride] : []),
          ],
          validate: validateEnv,
        }),
        // 全局限流：默认每 IP 每 60s 100 次；登录/刷新端点以 @Throttle 收紧
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
        // 缓存：默认内存存储（cache-manager/Keyv）；CACHE_STORE=redis 时切换为 Redis，
        // 缓存与幂等共享同一 Cache 实例——多实例部署仅需外置此存储，业务代码零改动
        CacheModule.registerAsync({
          isGlobal: true,
          inject: [ConfigService],
          useFactory: async (configService: ConfigService): Promise<CacheManagerOptions> => {
            if (configService.get<string>('cache.store') === 'redis') {
              const { default: KeyvRedis } = await import('@keyv/redis');
              return { stores: [new KeyvRedis(configService.getOrThrow<string>('cache.redisUrl'))] };
            }
            return {};
          },
        }),
        // 进程内事件总线：域事件解耦（跨进程可按事件契约替换为 MQ 实现）
        EventEmitterModule.forRoot(),
        LoggerModule,
        PrismaModule,
        // AUDIT_SINK 替换：从 replacements 中路由至审计模块（同 Token last-wins）
        AuditModule.forRoot(providersWithToken(replacements, AUDIT_SINK)),
        AuthModule,
      ],
      providers: globalProviders,
    };
  }
}
