import { Module } from '@nestjs/common';
import { HelloController } from './hello.controller.js';
import { HelloV2Controller } from './hello-v2.controller.js';
import { HelloService } from './hello.service.js';

@Module({
  controllers: [HelloController, HelloV2Controller],
  providers: [HelloService],
})
export class HelloModule {}
