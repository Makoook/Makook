import { Module } from '@nestjs/common';
import { IdentityController } from './identity.controller.js';
import { IdentityService } from './identity.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthorizationModule } from '../auth/authorization/authorization.module.js';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [IdentityController],
  providers: [IdentityService],
})
export class IdentityModule {}
