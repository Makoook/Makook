import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PaymentController } from './payment.controller.js';
import { DevelopmentPaymentProvider } from './payment.provider.js';
import { PaymentService } from './payment.service.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
  ],
  controllers: [PaymentController],
  providers: [
    PaymentService,
    {
      provide: 'PAYMENT_PROVIDER',
      useClass: DevelopmentPaymentProvider,
    },
  ],
  exports: [PaymentService],
})
export class PaymentModule {}
