import { Module } from '@nestjs/common';
import { HelloController } from './hello.controller';
import { HelloV2Controller } from './hello-v2.controller';
import { HelloService } from './hello.service';

@Module({
  controllers: [HelloController, HelloV2Controller],
  providers: [HelloService],
})
export class HelloModule {}
