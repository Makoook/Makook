import {
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { VerificationCodeType } from '../../generated/prisma/enums.js';
import { OtpController } from './otp.controller.js';
import { OtpService } from './otp.service.js';

describe('OtpController', () => {
  let controller: OtpController;
  let otpService: {
    requestOtp: ReturnType<typeof vi.fn>;
    findUserByIdentifier: ReturnType<typeof vi.fn>;
    verifyCode: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    otpService = {
      requestOtp: vi.fn(),
      findUserByIdentifier: vi.fn(),
      verifyCode: vi.fn(),
    };

    controller = new OtpController(
      otpService as unknown as OtpService,
    );
  });

  it('requests an email OTP with a normalized email address', async () => {
    otpService.requestOtp.mockResolvedValue(
      undefined,
    );

    const result =
      await controller.requestOtp({
        type: VerificationCodeType.EMAIL,
        identifier:
          '  TEST@MAKOOK.LOCAL  ',
      });

    expect(
      otpService.requestOtp,
    ).toHaveBeenCalledWith(
      VerificationCodeType.EMAIL,
      'test@makook.local',
    );

    expect(result).toEqual({
      message:
        'If the account exists, a verification code has been sent',
    });
  });

  it('requests a phone OTP with trimmed phone number', async () => {
    otpService.requestOtp.mockResolvedValue(
      undefined,
    );

    const result =
      await controller.requestOtp({
        type: VerificationCodeType.PHONE,
        identifier:
          '  +201000000000  ',
      });

    expect(
      otpService.requestOtp,
    ).toHaveBeenCalledWith(
      VerificationCodeType.PHONE,
      '+201000000000',
    );

    expect(result).toEqual({
      message:
        'If the account exists, a verification code has been sent',
    });
  });

  it('does not reveal whether an email account exists', async () => {
    otpService.requestOtp.mockResolvedValue(
      undefined,
    );

    const result =
      await controller.requestOtp({
        type: VerificationCodeType.EMAIL,
        identifier:
          'missing@makook.local',
      });

    expect(result).toEqual({
      message:
        'If the account exists, a verification code has been sent',
    });
  });

  it('does not reveal whether a phone account exists', async () => {
    otpService.requestOtp.mockResolvedValue(
      undefined,
    );

    const result =
      await controller.requestOtp({
        type: VerificationCodeType.PHONE,
        identifier:
          '+201099999999',
      });

    expect(result).toEqual({
      message:
        'If the account exists, a verification code has been sent',
    });
  });

  it('verifies a valid email OTP', async () => {
    const user = {
      id: 'user-email-id',
    };

    otpService.findUserByIdentifier.mockResolvedValue(
      user,
    );

    otpService.verifyCode.mockResolvedValue(
      undefined,
    );

    const result =
      await controller.verifyOtp({
        type: VerificationCodeType.EMAIL,
        identifier:
          '  TEST@MAKOOK.LOCAL  ',
        code: '123456',
      });

    expect(
      otpService.findUserByIdentifier,
    ).toHaveBeenCalledWith(
      VerificationCodeType.EMAIL,
      'test@makook.local',
    );

    expect(
      otpService.verifyCode,
    ).toHaveBeenCalledWith(
      'user-email-id',
      VerificationCodeType.EMAIL,
      '123456',
    );

    expect(result).toEqual({
      message:
        'Verification code accepted',
    });
  });

  it('verifies a valid phone OTP', async () => {
    const user = {
      id: 'user-phone-id',
    };

    otpService.findUserByIdentifier.mockResolvedValue(
      user,
    );

    otpService.verifyCode.mockResolvedValue(
      undefined,
    );

    const result =
      await controller.verifyOtp({
        type: VerificationCodeType.PHONE,
        identifier:
          '  +201000000000  ',
        code: '654321',
      });

    expect(
      otpService.findUserByIdentifier,
    ).toHaveBeenCalledWith(
      VerificationCodeType.PHONE,
      '+201000000000',
    );

    expect(
      otpService.verifyCode,
    ).toHaveBeenCalledWith(
      'user-phone-id',
      VerificationCodeType.PHONE,
      '654321',
    );

    expect(result).toEqual({
      message:
        'Verification code accepted',
    });
  });

  it('does not call verifyCode when the user does not exist', async () => {
    otpService.findUserByIdentifier.mockResolvedValue(
      null,
    );

    const result =
      await controller.verifyOtp({
        type: VerificationCodeType.EMAIL,
        identifier:
          'missing@makook.local',
        code: '123456',
      });

    expect(
      otpService.verifyCode,
    ).not.toHaveBeenCalled();

    expect(result).toEqual({
      message:
        'Verification code accepted',
    });
  });

  it('propagates an invalid OTP error', async () => {
    const user = {
      id: 'user-id',
    };

    otpService.findUserByIdentifier.mockResolvedValue(
      user,
    );

    otpService.verifyCode.mockRejectedValue(
      new UnauthorizedException(
        'Invalid verification code',
      ),
    );

    await expect(
      controller.verifyOtp({
        type: VerificationCodeType.EMAIL,
        identifier:
          'test@makook.local',
        code: '000000',
      }),
    ).rejects.toThrow(
      'Invalid verification code',
    );
  });

  it('propagates the maximum-attempts error', async () => {
    const user = {
      id: 'user-id',
    };

    otpService.findUserByIdentifier.mockResolvedValue(
      user,
    );

    otpService.verifyCode.mockRejectedValue(
      new BadRequestException(
        'Too many verification attempts',
      ),
    );

    await expect(
      controller.verifyOtp({
        type: VerificationCodeType.EMAIL,
        identifier:
          'test@makook.local',
        code: '123456',
      }),
    ).rejects.toThrow(
      'Too many verification attempts',
    );
  });

  it('does not modify the case of a phone identifier', async () => {
    otpService.requestOtp.mockResolvedValue(
      undefined,
    );

    await controller.requestOtp({
      type: VerificationCodeType.PHONE,
      identifier:
        '  +201012345678  ',
    });

    expect(
      otpService.requestOtp,
    ).toHaveBeenCalledWith(
      VerificationCodeType.PHONE,
      '+201012345678',
    );
  });
});