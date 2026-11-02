import { Module } from '@nestjs/common';
import { UserController } from './user.controller.js';
import { UserEventsListener } from './user.events.js';
import { UserRepository } from './user.repository.js';
import { UserService } from './user.service.js';

@Module({
  controllers: [UserController],
  providers: [UserService, UserRepository, UserEventsListener],
  exports: [UserService], // 供 infra/auth 调用 verifyCredentials
})
export class UserModule {}
