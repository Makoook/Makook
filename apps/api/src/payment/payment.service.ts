import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PaymentStatus,
  PaymentWebhookStatus,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { PaymentProvider } from './payment.provider.js';

@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('PAYMENT_PROVIDER')
    private readonly provider: PaymentProvider,
  ) {}

  private validateKey(
    key: string | undefined,
  ): string {
    if (
      typeof key !== 'string' ||
      key.length < 16 ||
      key.length > 200
    ) {
      throw new BadRequestException(
        'Invalid Idempotency-Key',
      );
    }

    return key;
  }

  private hash(value: unknown): string {
    return createHash('sha256')
      .update(JSON.stringify(value))
      .digest('hex');
  }

  async createIntent(
    customerId: string,
    missionId: string,
    rawIdempotencyKey: string | undefined,
  ) {
    const idempotencyKey =
      this.validateKey(rawIdempotencyKey);

    const mission =
      await this.prisma.mission.findUnique({
        where: { id: missionId },
      });

    if (!mission) {
      throw new NotFoundException(
        'Mission not found',
      );
    }

    if (mission.customerId !== customerId) {
      throw new ForbiddenException();
    }

    const quotedAmount = mission.quotedAmount;
    const currency = mission.currency;

    if (quotedAmount === null || currency === null) {
      throw new BadRequestException(
        'Mission pricing is not available',
      );
    }

    const requestHash = this.hash({
      missionId,
    });

    const existing =
      await this.prisma.paymentIdempotency.findUnique({
        where: {
          userId_key_operation: {
            userId: customerId,
            key: idempotencyKey,
            operation: 'create',
          },
        },
      });

    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException(
          'Idempotency key reused with a different request',
        );
      }

      if (
        existing.status === 'COMPLETED' &&
        existing.responseBody
      ) {
        return existing.responseBody;
      }

      throw new ConflictException(
        'Payment operation is already processing',
      );
    }

    let payment;
    let claim;

    try {
      const created =
        await this.prisma.$transaction(
          async (tx) => {
            const idempotency =
              await tx.paymentIdempotency.create({
                data: {
                  key: idempotencyKey,
                  operation: 'create',
                  userId: customerId,
                  requestHash,
                  status: 'PROCESSING',
                },
              });

            const paymentRecord =
              await tx.payment.create({
                data: {
                  missionId,
                  customerId,
                  amount: quotedAmount,
                  currency,
                  status: PaymentStatus.CREATED,
                },
              });

            return {
              idempotency,
              paymentRecord,
            };
          },
        );

      claim = created.idempotency;
      payment = created.paymentRecord;
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002'
      ) {
        throw new ConflictException(
          'Payment creation already exists',
        );
      }

      throw error;
    }

    try {
      const result =
        await this.provider.createIntent(
          payment.id,
          quotedAmount.toString(),
          currency,
          `create:${idempotencyKey}`,
        );

      const updated =
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            provider: 'development',
            providerPaymentId:
              result.providerPaymentId,
          },
        });

      const response = {
        id: updated.id,
        missionId: updated.missionId,
        customerId: updated.customerId,
        amount: updated.amount.toString(),
        currency: updated.currency,
        status: updated.status,
        provider: updated.provider,
        providerPaymentId:
          updated.providerPaymentId,
      };

      await this.prisma.paymentIdempotency.update({
        where: { id: claim.id },
        data: {
          status: 'COMPLETED',
          paymentId: updated.id,
          responseStatus: 201,
          responseBody: response,
        },
      });

      return response;
    } catch (error) {
      await this.prisma.paymentIdempotency.update({
        where: { id: claim.id },
        data: {
          status: 'FAILED',
          responseStatus: 502,
          responseBody: {
            error: 'Payment provider operation failed',
          },
        },
      });

      throw error;
    }
  }

  async getMine(
    paymentId: string,
    customerId: string,
  ) {
    const payment =
      await this.prisma.payment.findUnique({
        where: { id: paymentId },
      });

    if (!payment) {
      throw new NotFoundException(
        'Payment not found',
      );
    }

    if (payment.customerId !== customerId) {
      throw new ForbiddenException();
    }

    return payment;
  }

  async authorize(
    paymentId: string,
    customerId: string,
    rawIdempotencyKey: string | undefined,
  ) {
    return this.transition(
      paymentId,
      customerId,
      rawIdempotencyKey,
      'authorize',
      PaymentStatus.CREATED,
      PaymentStatus.AUTHORIZED,
      'authorize',
    );
  }

  async capture(
    paymentId: string,
    customerId: string,
    rawIdempotencyKey: string | undefined,
  ) {
    return this.transition(
      paymentId,
      customerId,
      rawIdempotencyKey,
      'capture',
      PaymentStatus.AUTHORIZED,
      PaymentStatus.CAPTURED,
      'capture',
    );
  }

  async refund(
    paymentId: string,
    customerId: string,
    rawIdempotencyKey: string | undefined,
  ) {
    return this.transition(
      paymentId,
      customerId,
      rawIdempotencyKey,
      'refund',
      PaymentStatus.CAPTURED,
      PaymentStatus.REFUNDED,
      'refund',
    );
  }

  private async transition(
    paymentId: string,
    customerId: string,
    rawIdempotencyKey: string | undefined,
    operation: string,
    expectedStatus: PaymentStatus,
    nextStatus: PaymentStatus,
    providerOperation:
      | 'authorize'
      | 'capture'
      | 'refund',
  ) {
    const idempotencyKey =
      this.validateKey(rawIdempotencyKey);

    const payment =
      await this.prisma.payment.findUnique({
        where: { id: paymentId },
      });

    if (!payment) {
      throw new NotFoundException(
        'Payment not found',
      );
    }

    if (payment.customerId !== customerId) {
      throw new ForbiddenException();
    }

    if (!payment.providerPaymentId) {
      throw new BadRequestException(
        'Provider payment reference is missing',
      );
    }

    const requestHash = this.hash({
      paymentId,
    });

    const existing =
      await this.prisma.paymentIdempotency.findUnique({
        where: {
          userId_key_operation: {
            userId: customerId,
            key: idempotencyKey,
            operation,
          },
        },
      });

    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException(
          'Idempotency key reused with a different request',
        );
      }

      if (
        existing.status === 'COMPLETED' &&
        existing.responseBody
      ) {
        return existing.responseBody;
      }

      throw new ConflictException(
        'Payment operation is already processing',
      );
    }

    let claim;

    try {
      claim =
        await this.prisma.paymentIdempotency.create({
          data: {
            key: idempotencyKey,
            operation,
            userId: customerId,
            paymentId,
            requestHash,
            status: 'PROCESSING',
          },
        });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002'
      ) {
        throw new ConflictException(
          'Payment operation already exists',
        );
      }

      throw error;
    }

    try {
      await this.provider[providerOperation](
        payment.providerPaymentId,
        `${operation}:${idempotencyKey}`,
      );

      const changed =
        await this.prisma.payment.updateMany({
          where: {
            id: paymentId,
            customerId,
            status: expectedStatus,
          },
          data: {
            status: nextStatus,
          },
        });

      if (changed.count !== 1) {
        throw new ConflictException(
          'Invalid payment state transition',
        );
      }

      const updated =
        await this.prisma.payment.findUniqueOrThrow({
          where: { id: paymentId },
        });

      await this.prisma.paymentIdempotency.update({
        where: { id: claim.id },
        data: {
          status: 'COMPLETED',
          responseStatus: 200,
          responseBody: updated,
        },
      });

      return updated;
    } catch (error) {
      await this.prisma.paymentIdempotency.update({
        where: { id: claim.id },
        data: {
          status: 'FAILED',
        },
      });

      throw error;
    }
  }

  async processWebhook(
    provider: string,
    providerEventId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ) {
    const payloadHash = this.hash(payload);

    const existing =
      await this.prisma.paymentWebhookEvent.findUnique({
        where: {
          provider_providerEventId: {
            provider,
            providerEventId,
          },
        },
      });

    if (existing) {
      if (existing.payloadHash !== payloadHash) {
        throw new ConflictException(
          'Webhook ID reused with a different payload',
        );
      }

      return existing;
    }

    try {
      return await this.prisma.paymentWebhookEvent.create({
        data: {
          provider,
          providerEventId,
          eventType,
          payloadHash,
          status: PaymentWebhookStatus.RECEIVED,
        },
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002'
      ) {
        return this.prisma.paymentWebhookEvent.findUniqueOrThrow({
          where: {
            provider_providerEventId: {
              provider,
              providerEventId,
            },
          },
        });
      }

      throw error;
    }
  }
}
