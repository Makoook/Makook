import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  createHmac,
  timingSafeEqual,
} from 'node:crypto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto.js';
import { PaymentWebhookDto } from './dto/payment-webhook.dto.js';
import { PaymentService } from './payment.service.js';

interface AuthenticatedRequest {
  user: {
    userId: string;
    sessionId: string;
  };
}

interface RawBodyRequest extends AuthenticatedRequest {
  rawBody?: Buffer;
}

@Controller('payments')
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
  ) {}

  @Post('intents')
  @UseGuards(JwtAuthGuard)
  async createIntent(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreatePaymentIntentDto,
    @Headers('idempotency-key')
    idempotencyKey: string | undefined,
  ) {
    return this.paymentService.createIntent(
      request.user.userId,
      dto.missionId,
      idempotencyKey,
    );
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async get(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.paymentService.getMine(
      id,
      request.user.userId,
    );
  }

  @Post(':id/authorize')
  @UseGuards(JwtAuthGuard)
  async authorize(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Headers('idempotency-key')
    idempotencyKey: string | undefined,
  ) {
    return this.paymentService.authorize(
      id,
      request.user.userId,
      idempotencyKey,
    );
  }

  @Post(':id/capture')
  @UseGuards(JwtAuthGuard)
  async capture(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Headers('idempotency-key')
    idempotencyKey: string | undefined,
  ) {
    return this.paymentService.capture(
      id,
      request.user.userId,
      idempotencyKey,
    );
  }

  @Post(':id/refund')
  @UseGuards(JwtAuthGuard)
  async refund(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Headers('idempotency-key')
    idempotencyKey: string | undefined,
  ) {
    return this.paymentService.refund(
      id,
      request.user.userId,
      idempotencyKey,
    );
  }

  @Post('webhooks/:provider')
  async webhook(
    @Req() request: RawBodyRequest,
    @Param('provider') provider: string,
    @Body() dto: PaymentWebhookDto,
    @Headers('x-webhook-signature')
    signature: string | undefined,
  ) {
    const secret =
      process.env.PAYMENT_WEBHOOK_SECRET;

    if (!secret || !signature) {
      throw new UnauthorizedException();
    }

    const rawBody =
      request.rawBody ??
      Buffer.from(JSON.stringify(dto));

    const expected = createHmac(
      'sha256',
      secret,
    )
      .update(rawBody)
      .digest('hex');

    const received =
      Buffer.from(signature, 'utf8');
    const expectedBuffer =
      Buffer.from(expected, 'utf8');

    if (
      received.length !==
        expectedBuffer.length ||
      !timingSafeEqual(
        received,
        expectedBuffer,
      )
    ) {
      throw new UnauthorizedException();
    }

    return this.paymentService.processWebhook(
      provider,
      dto.providerEventId,
      dto.eventType,
      dto.payload,
    );
  }
}
