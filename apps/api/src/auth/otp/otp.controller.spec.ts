import {
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VerificationCodeType } from '../../generated/prisma/enums.js';
import { AuthService } from '../auth.service.js';
import { OtpController } from './otp.controller.js';
import { OtpService } from './otp.service.js';

describe('OtpController', () => {
  let controller: OtpController;

  let otpService: {
    requestOtp: ReturnType<typeof vi.fn>;
  };

  let authService: {
    authenticateWithOtp: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    otpService = {
      requestOtp: vi.fn(),
    };

    authService = {
      authenticateWithOtp: vi.fn(),
    };

    controller = new OtpController(
      otpService as unknown as OtpService,
      authService as unknown as AuthService,
    );
  });

  describe('requestOtp', () => {
    it('normalizes an email before requesting an OTP', async () => {
      await controller.requestOtp({
        type: VerificationCodeType.EMAIL,
        identifier: '  TEST@MAKOOK.LOCAL  ',
      });

      expect(otpService.requestOtp).toHaveBeenCalledTimes(1);
      expect(otpService.requestOtp).toHaveBeenCalledWith(
        VerificationCodeType.EMAIL,
        'test@makook.local',
      );
    });

    it('normalizes a phone before requesting an OTP', async () => {
      await controller.requestOtp({
        type: VerificationCodeType.PHONE,
        identifier: '  +201000000000  ',
      });

      expect(otpService.requestOtp).toHaveBeenCalledTimes(1);
      expect(otpService.requestOtp).toHaveBeenCalledWith(
        VerificationCodeType.PHONE,
        '+201000000000',
      );
    });

    it('returns the generic response for an email request', async () => {
      await expect(
        controller.requestOtp({
          type: VerificationCodeType.EMAIL,
          identifier: 'person@makook.local',
        }),
      ).resolves.toEqual({
        message:
          'If the identifier can be used, a verification code has been sent',
      });
    });

    it('returns the generic response for a phone request', async () => {
      await expect(
        controller.requestOtp({
          type: VerificationCodeType.PHONE,
          identifier: '+201000000000',
        }),
      ).resolves.toEqual({
        message:
          'If the identifier can be used, a verification code has been sent',
      });
    });

    it('propagates a service error without changing it', async () => {
      const error = new BadRequestException('invalid identifier');

      otpService.requestOtp.mockRejectedValue(error);

      await expect(
        controller.requestOtp({
          type: VerificationCodeType.EMAIL,
          identifier: 'invalid',
        }),
      ).rejects.toBe(error);
    });

    it('does not expose account existence through its response', async () => {
      const response = await controller.requestOtp({
        type: VerificationCodeType.EMAIL,
        identifier: 'unknown@makook.local',
      });

      expect(response).toEqual({
        message:
          'If the identifier can be used, a verification code has been sent',
      });
    });
  });

  describe('verifyOtp', () => {
    it('authenticates with a normalized email and returns tokens', async () => {
      const authentication = {
        sessionId: 'session-id',
        refreshToken: 'refresh-token',
        accessToken: 'access-token',
      };

      authService.authenticateWithOtp.mockResolvedValue(authentication);

      await expect(
        controller.verifyOtp({
          type: VerificationCodeType.EMAIL,
          identifier: '  TEST@MAKOOK.LOCAL  ',
          code: '123456',
          deviceId: 'device-id',
        }),
      ).resolves.toEqual(authentication);

      expect(authService.authenticateWithOtp).toHaveBeenCalledTimes(1);
      expect(authService.authenticateWithOtp).toHaveBeenCalledWith(
        VerificationCodeType.EMAIL,
        'test@makook.local',
        '123456',
        'device-id',
      );
    });

    it('authenticates with a normalized phone and returns tokens', async () => {
      const authentication = {
        sessionId: 'session-id',
        refreshToken: 'refresh-token',
        accessToken: 'access-token',
      };

      authService.authenticateWithOtp.mockResolvedValue(authentication);

      await expect(
        controller.verifyOtp({
          type: VerificationCodeType.PHONE,
          identifier: '  +201000000000  ',
          code: '654321',
          deviceId: 'device-123',
        }),
      ).resolves.toEqual(authentication);

      expect(authService.authenticateWithOtp).toHaveBeenCalledTimes(1);
      expect(authService.authenticateWithOtp).toHaveBeenCalledWith(
        VerificationCodeType.PHONE,
        '+201000000000',
        '654321',
        'device-123',
      );
    });

    it('passes an omitted deviceId as undefined', async () => {
      const authentication = {
        sessionId: 'session-id',
        refreshToken: 'refresh-token',
        accessToken: 'access-token',
      };

      authService.authenticateWithOtp.mockResolvedValue(authentication);

      await controller.verifyOtp({
        type: VerificationCodeType.EMAIL,
        identifier: 'user@makook.local',
        code: '123456',
      });

      expect(authService.authenticateWithOtp).toHaveBeenCalledWith(
        VerificationCodeType.EMAIL,
        'user@makook.local',
        '123456',
        undefined,
      );
    });

    it('propagates an authentication error without changing it', async () => {
      const error = new UnauthorizedException('Invalid verification code');

      authService.authenticateWithOtp.mockRejectedValue(error);

      await expect(
        controller.verifyOtp({
          type: VerificationCodeType.EMAIL,
          identifier: 'user@makook.local',
          code: '123456',
        }),
      ).rejects.toBe(error);
    });
  });
});