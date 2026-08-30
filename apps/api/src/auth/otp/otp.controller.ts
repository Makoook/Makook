import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { VerificationCodeType } from '../../generated/prisma/enums.js';
import { AuthService } from '../auth.service.js';
import { OtpService } from './otp.service.js';
import { RequestOtpDto } from './request-otp.dto.js';
import { VerifyOtpDto } from './verify-otp.dto.js';
import { normalizeIdentifier } from '../../identity/identifier-normalizer.js';

@Controller('auth/otp')
export class OtpController {
  constructor(
    private readonly otpService: OtpService,
    private readonly authService: AuthService,
  ) {}

  @Post('request')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestOtp(
    @Body() dto: RequestOtpDto,
  ): Promise<{
    message: string;
  }> {
    await this.otpService.requestOtp(
      dto.type,
      normalizeIdentifier(dto.type, dto.identifier),
    );

    return {
      message:
        'If the identifier can be used, a verification code has been sent',
    };
  }

  @Post('verify')
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
  ): Promise<{
    sessionId: string;
    refreshToken: string;
    accessToken: string;
  }> {
    return this.authService.authenticateWithOtp(
      dto.type,
      normalizeIdentifier(dto.type, dto.identifier),
      dto.code,
      dto.deviceId,
    );
  }
}
