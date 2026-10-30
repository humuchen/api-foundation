import { Injectable } from '@nestjs/common';

/**
 * 自 app/services/hello.service.ts 原样迁移：业务返回值保持裸数据，
 * 响应包壳由全局 TransformInterceptor 完成（业务代码零改动衔接底座）。
 */
@Injectable()
export class HelloService {
  getHello(name?: string): string {
    return `Hello from NestJS v12.3.0${name ? `, ${name}` : ''}!`;
  }

  getHelloWorld(name?: string): string {
    return `Hello ${name ? `, ${name}` : 'World'}!`;
  }
}
