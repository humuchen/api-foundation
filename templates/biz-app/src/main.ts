import 'reflect-metadata';
import { bootstrap } from '@humuchen/foundation';
import { AppModule } from './app.module.js';

// 业务入口：全局 Pipe/Guard/Filter/Interceptor、安全加固、前缀/版本化、Swagger 均由底座内置
void bootstrap(AppModule);
