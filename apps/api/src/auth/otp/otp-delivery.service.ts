import { Injectable } from '@nestjs/common';
import { VerificationCodeType } from '../../generated/prisma/enums.js';

export interface OtpDeliveryMessage {
  type: VerificationCodeType;
  identifier: string;
  code: string;
}

@Injectable()
export class OtpDeliveryService {
  private readonly developmentCodes = new Map<
    string,
    string
  >();

  async send(
    message: OtpDeliveryMessage,
  ): Promise<void> {
    const key = this.createKey(
      message.type,
      message.identifier,
    );

    if (process.env.NODE_ENV !== 'production') {
      this.developmentCodes.set(
        key,
        message.code,
      );
    }

    if (
      message.type ===
      VerificationCodeType.EMAIL
    ) {
      await this.sendEmail(
        message.identifier,
        message.code,
      );

      return;
    }

    if (
      message.type ===
      VerificationCodeType.PHONE
    ) {
      await this.sendPhoneMessage(
        message.identifier,
        message.code,
      );

      return;
    }

    throw new Error(
      'Unsupported OTP delivery type',
    );
  }

  getDevelopmentCode(
    type: VerificationCodeType,
    identifier: string,
  ): string | null {
    if (
      process.env.NODE_ENV === 'production'
    ) {
      return null;
    }

    const key = this.createKey(
      type,
      identifier,
    );

    return (
      this.developmentCodes.get(key) ??
      null
    );
  }

  clearDevelopmentCode(
    type: VerificationCodeType,
    identifier: string,
  ): void {
    const key = this.createKey(
      type,
      identifier,
    );

    this.developmentCodes.delete(key);
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
    if (
      process.env.NODE_ENV !== 'production'
    ) {
      return;
    }

    /*
     * The production email provider will be
     * connected here later.
     */
    void email;
    void code;
  }

  private async sendPhoneMessage(
    phone: string,
    code: string,
  ): Promise<void> {
    if (
      process.env.NODE_ENV !== 'production'
    ) {
      return;
    }

    /*
     * The production SMS/WhatsApp provider
     * will be connected here later.
     */
    void phone;
    void code;
  }
}