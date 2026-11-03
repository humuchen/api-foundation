import 'reflect-metadata';
import { bootstrap } from '../../src/factory/index.js';
import { AppModule } from './app.module.js';

/**
 * demo 宿主入口：业务项目的 main.ts 只剩装配调用。
 * 端口/前缀走环境变量（PORT / GLOBAL_PREFIX），Swagger 默认开启。
 */
void bootstrap(AppModule);
