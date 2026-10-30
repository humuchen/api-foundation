import { HttpStatus, Module, ValidationPipe } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { LoggerModule } from './infra/logger';
import { PrismaModule } from './infra/database/prisma.module';
import { AuditInterceptor } from './infra/audit/audit.interceptor';
import { AuditModule } from './infra/audit/audit.module';
import { AuthModule } from './infra/auth/auth.module';
import { IdempotencyInterceptor } from './infra/idempotency/idempotency.interceptor';
import { ErrorCode } from './common/error-codes';
import { BizException } from './common/exceptions/biz.exception';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { HealthModule } from './health';
import { HelloModule } from './modules/hello';
import { UserModule } from './modules/user';

/**
 * 根模块：配置（全局） + 日志/认证/审计/缓存/事件基建 + 业务模块。
 *
 * 底座能力经全局 Provider 注入，业务模块零感知：
 *  - APP_PIPE：全局参数校验；校验失败抛 BizException(10001, 明细)，交由过滤器统一出口
 *  - APP_GUARD：ThrottlerGuard（限流，429→50003）→ JwtAuthGuard → RolesGuard（@Public 白名单、@Roles 角色）
 *  - APP_FILTER：AllExceptionsFilter 兜底所有异常
 *  - APP_INTERCEPTOR：Logging（耗时）、Audit（审计埋点）、Idempotency（幂等重放）、Transform（响应包壳）
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    // 全局限流：默认每 IP 每 60s 100 次；登录/刷新端点以 @Throttle 收紧
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    // 缓存：默认内存存储（cache-manager/Keyv）；生产接入 Redis 仅需替换 stores 配置
    CacheModule.register({ isGlobal: true }),
    // 进程内事件总线：域事件解耦（跨进程可按事件契约替换为 MQ 实现）
    EventEmitterModule.forRoot(),
    LoggerModule,
    PrismaModule,
    AuditModule,
    AuthModule,
    HelloModule,
    UserModule,
    HealthModule,
  ],
  providers: [
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
  ],
})
export class AppModule {}

