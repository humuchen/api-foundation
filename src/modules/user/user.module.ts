import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserEventsListener } from './user.events';
import { UserRepository } from './user.repository';
import { UserService } from './user.service';

@Module({
  controllers: [UserController],
  providers: [UserService, UserRepository, UserEventsListener],
  exports: [UserService], // 供 infra/auth 调用 verifyCredentials
})
export class UserModule {}
