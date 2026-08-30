import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { OtpDeliveryService } from './otp-delivery.service.js';
import { OtpService } from './otp.service.js';

@Module({
  imports: [
    PrismaModule,
  ],
  providers: [
    OtpDeliveryService,
    OtpService,
  ],
  exports: [
    OtpDeliveryService,
    OtpService,
  ],
})
export class OtpModule {}
