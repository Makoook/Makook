import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import {
  ConfigModule,
  ConfigService,
} from '@nestjs/config';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { OtpModule } from './otp/otp.module.js';
import { OtpController } from './otp/otp.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthorizationModule } from './authorization/authorization.module.js';

@Module({
  imports: [
    PrismaModule,
    OtpModule,
    AuthorizationModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (
        config: ConfigService,
      ) => ({
        secret:
          config.getOrThrow<string>(
            'JWT_ACCESS_SECRET',
          ),
        signOptions: {
          expiresIn: '15m',
        },
      }),
    }),
  ],
  controllers: [
    AuthController,
    OtpController,
  ],
  providers: [
    AuthService,
  ],
  exports: [
    AuthService,
    JwtModule,
  ],
})
export class AuthModule {}
