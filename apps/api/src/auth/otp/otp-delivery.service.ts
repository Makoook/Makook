import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';
import twilio from 'twilio';
import { VerificationCodeType } from '../../generated/prisma/enums.js';

export interface OtpDeliveryMessage {
  type: VerificationCodeType;
  identifier: string;
  code: string;
}

@Injectable()
export class OtpDeliveryService {
  private readonly developmentCodes = new Map<string, string>();

  async send(message: OtpDeliveryMessage): Promise<void> {
    const key = this.createKey(message.type, message.identifier);

    if (process.env.NODE_ENV !== 'production') {
      this.developmentCodes.set(key, message.code);
    }

    if (message.type === VerificationCodeType.EMAIL) {
      await this.sendEmail(message.identifier, message.code);
      return;
    }

    if (message.type === VerificationCodeType.PHONE) {
      await this.sendPhoneMessage(message.identifier, message.code);
      return;
    }

    throw new Error('Unsupported OTP delivery type');
  }

  getDevelopmentCode(
    type: VerificationCodeType,
    identifier: string,
  ): string | null {
    if (process.env.NODE_ENV === 'production') {
      return null;
    }

    return (
      this.developmentCodes.get(
        this.createKey(type, identifier),
      ) ?? null
    );
  }

  clearDevelopmentCode(
    type: VerificationCodeType,
    identifier: string,
  ): void {
    this.developmentCodes.delete(
      this.createKey(type, identifier),
    );
  }

  private createKey(
    type: VerificationCodeType,
    identifier: string,
  ): string {
    return `${type}:${identifier}`;
  }

  private async sendEmail(
    email: string,
    code: string,
  ): Promise<void> {
    if (process.env.NODE_ENV !== 'production') {
      return;
    }

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;

    if (!apiKey || !from) {
      throw new Error('Email OTP provider is not configured');
    }

    const resend = new Resend(apiKey);

    const result = await resend.emails.send({
      from,
      to: email,
      subject: 'Your Makook verification code',
      text: `Your Makook verification code is: ${code}`,
    });

    if (result.error) {
      throw new Error('Email OTP delivery failed');
    }
  }

  private async sendPhoneMessage(
    phone: string,
    code: string,
  ): Promise<void> {
    if (process.env.NODE_ENV !== 'production') {
      return;
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM_PHONE;

    if (!accountSid || !authToken || !from) {
      throw new Error('SMS OTP provider is not configured');
    }

    const client = twilio(accountSid, authToken);

    try {
      await client.messages.create({
        body: `Your Makook verification code is: ${code}`,
        from,
        to: phone,
      });
    } catch {
      throw new Error('SMS OTP delivery failed');
    }
  }
}
