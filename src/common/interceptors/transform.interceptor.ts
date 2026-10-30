import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { ApiResponse, buildSuccess, isApiResponse } from '../responses/api-response';
import { getRequestId } from '../../infra/logger';

/**
 * 统一响应包壳：业务代码只返回 data，此处统一包为 ApiResponse。
 * 规则：
 *  - handler 返回 undefined / null 时归一为 null，保证 data 字段始终存在；
 *  - 已符合 ApiResponse 形态的返回值直接透传（防御性，支持个别端点自控响应）；
 *  - 异常不经过本拦截器（rxjs error 旁路），统一由 AllExceptionsFilter 输出。
 * 与 LoggingInterceptor 无顺序耦合（后者为透传观察者）。
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(_ctx: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) =>
        isApiResponse(data)
          ? (data as unknown as ApiResponse<T>)
          : buildSuccess((data ?? null) as T, getRequestId()),
      ),
    );
  }
}
