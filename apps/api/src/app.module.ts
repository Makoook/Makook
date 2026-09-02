import { APP_GUARD } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { IdentityModule } from './identity/identity.module.js';
import { AuthModule } from './auth/auth.module.js';
import { MissionModule } from './mission/mission.module.js';
import { PaymentModule } from './payment/payment.module.js';

@Module({
  imports: [PaymentModule, 
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
      validate: (env) => {
        const required = [
          'DATABASE_URL',
          'JWT_ACCESS_SECRET',
        ];

        if (env.NODE_ENV === 'production') {
          required.push(
            'RESEND_API_KEY',
            'RESEND_FROM_EMAIL',
            'TWILIO_ACCOUNT_SID',
            'TWILIO_AUTH_TOKEN',
            'TWILIO_FROM_PHONE',
            'REDIS_URL',
          );
        }

        if (env.TRUST_PROXY_HOPS !== undefined) {
          const hops = Number(env.TRUST_PROXY_HOPS);

          if (
            !Number.isInteger(hops) ||
            hops < 0 ||
            hops > 10
          ) {
            throw new Error(
              'TRUST_PROXY_HOPS must be an integer between 0 and 10',
            );
          }
        }

        for (const key of required) {
          if (!env[key]) {
            throw new Error(
              `Missing required environment variable: ${key}`,
            );
          }
        }

        return env;
      },
    }),

    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProduction =
          config.get<string>('NODE_ENV') === 'production';

        return {
          throttlers: [
            {
              ttl: 60000,
              limit: 100,
            },
          ],
          ...(isProduction
            ? {
                storage:
                  new ThrottlerStorageRedisService(
                    config.getOrThrow<string>('REDIS_URL'),
                  ),
              }
            : {}),
        };
      },
    }),
  PrismaModule,
  HealthModule,
  IdentityModule,
  AuthModule,
  MissionModule,
],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
