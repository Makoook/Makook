import { Module } from '@nestjs/common';
import {
  ConfigModule,
  ConfigService,
} from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AuthorizationService } from './authorization.service.js';
import { AuthorizationController } from './authorization.controller.js';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>(
          'JWT_ACCESS_SECRET',
        ),
        signOptions: {
          expiresIn: '15m',
        },
      }),
    }),
  ],
  controllers: [AuthorizationController],
  providers: [
    AuthorizationService,
    JwtAuthGuard,
  ],
  exports: [
    AuthorizationService,
  ],
})
export class AuthorizationModule {}
