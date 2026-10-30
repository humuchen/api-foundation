import { Global, Module } from '@nestjs/common';
import { AppLoggerService } from './app-logger.service';

/** 全局日志模块：导出 AppLoggerService 供 main.ts 执行 app.useLogger */
@Global()
@Module({
  providers: [AppLoggerService],
  exports: [AppLoggerService],
})
export class LoggerModule {}
