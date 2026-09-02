import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthorizationModule } from '../auth/authorization/authorization.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { MissionController } from './mission.controller.js';
import { MissionService } from './mission.service.js';

@Module({
  imports: [
    PrismaModule,
    AuthorizationModule,
    AuthModule,
  ],
  controllers: [
    MissionController,
  ],
  providers: [
    MissionService,
  ],
  exports: [
    MissionService,
  ],
})
export class MissionModule {}
