import {
  Body,
  Controller,
  Post,
} from '@nestjs/common';
import { VerificationCodeType } from '../../generated/prisma/enums.js';
import { OtpService } from './otp.service.js';
import { RequestOtpDto } from './request-otp.dto.js';
import { VerifyOtpDto } from './verify-otp.dto.js';

@Controller('auth/otp')
export class OtpController {
  constructor(
    private readonly otpService: OtpService,
  ) {}

  @Post('request')
  async requestOtp(
    @Body() dto: RequestOtpDto,
  ): Promise<{
    message: string;
  }> {
    const identifier =
      this.normalizeIdentifier(
        dto.type,
        dto.identifier,
      );

    await this.otpService.requestOtp(
      dto.type,
      identifier,
    );

    return {
      message:
        'If the account exists, a verification code has been sent',
    };
  }

  @Post('verify')
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
  ): Promise<{
    message: string;
  }> {
    const identifier =
      this.normalizeIdentifier(
        dto.type,
        dto.identifier,
      );

    const user =
      await this.otpService.findUserByIdentifier(
        dto.type,
        identifier,
      );

    if (!user) {
      return {
        message:
          'Verification code accepted',
      };
    }

    await this.otpService.verifyCode(
      user.id,
      dto.type,
      dto.code,
    );

    return {
      message:
        'Verification code accepted',
    };
  }

  private normalizeIdentifier(
    type: VerificationCodeType,
    identifier: string,
  ): string {
    const normalizedIdentifier =
      identifier.trim();

    if (
      type ===
      VerificationCodeType.EMAIL
    ) {
      return normalizedIdentifier.toLowerCase();
    }

    return normalizedIdentifier;
  }
}