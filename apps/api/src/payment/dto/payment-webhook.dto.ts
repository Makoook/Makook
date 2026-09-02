import {
  IsObject,
  IsString,
  Length,
} from 'class-validator';

export class PaymentWebhookDto {
  @IsString()
  @Length(1, 200)
  providerEventId!: string;

  @IsString()
  @Length(1, 100)
  eventType!: string;

  @IsObject()
  payload!: Record<string, unknown>;
}
