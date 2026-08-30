import { VerificationCodeType } from '../../generated/prisma/enums.js';
import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import {
  OtpDeliveryService,
} from './otp-delivery.service.js';

describe('OtpDeliveryService', () => {
  let deliveryService: OtpDeliveryService;

  beforeEach(() => {
    deliveryService =
      new OtpDeliveryService();
  });

  it('stores an email OTP in development mode', async () => {
    const originalNodeEnv =
      process.env.NODE_ENV;

    process.env.NODE_ENV =
      'development';

    await deliveryService.send({
      type: VerificationCodeType.EMAIL,
      identifier: 'test@makook.local',
      code: '123456',
    });

    expect(
      deliveryService.getDevelopmentCode(
        VerificationCodeType.EMAIL,
        'test@makook.local',
      ),
    ).toBe('123456');

    process.env.NODE_ENV =
      originalNodeEnv;
  });

  it('stores a phone OTP in development mode', async () => {
    const originalNodeEnv =
      process.env.NODE_ENV;

    process.env.NODE_ENV =
      'development';

    await deliveryService.send({
      type: VerificationCodeType.PHONE,
      identifier: '+201000000000',
      code: '654321',
    });

    expect(
      deliveryService.getDevelopmentCode(
        VerificationCodeType.PHONE,
        '+201000000000',
      ),
    ).toBe('654321');

    process.env.NODE_ENV =
      originalNodeEnv;
  });

  it('returns null when no development OTP exists', () => {
    const originalNodeEnv =
      process.env.NODE_ENV;

    process.env.NODE_ENV =
      'development';

    expect(
      deliveryService.getDevelopmentCode(
        VerificationCodeType.EMAIL,
        'missing@makook.local',
      ),
    ).toBeNull();

    process.env.NODE_ENV =
      originalNodeEnv;
  });

  it('clears a development email OTP', async () => {
    const originalNodeEnv =
      process.env.NODE_ENV;

    process.env.NODE_ENV =
      'development';

    await deliveryService.send({
      type: VerificationCodeType.EMAIL,
      identifier: 'clear@makook.local',
      code: '111111',
    });

    deliveryService.clearDevelopmentCode(
      VerificationCodeType.EMAIL,
      'clear@makook.local',
    );

    expect(
      deliveryService.getDevelopmentCode(
        VerificationCodeType.EMAIL,
        'clear@makook.local',
      ),
    ).toBeNull();

    process.env.NODE_ENV =
      originalNodeEnv;
  });

  it('clears a development phone OTP', async () => {
    const originalNodeEnv =
      process.env.NODE_ENV;

    process.env.NODE_ENV =
      'development';

    await deliveryService.send({
      type: VerificationCodeType.PHONE,
      identifier: '+201011111111',
      code: '222222',
    });

    deliveryService.clearDevelopmentCode(
      VerificationCodeType.PHONE,
      '+201011111111',
    );

    expect(
      deliveryService.getDevelopmentCode(
        VerificationCodeType.PHONE,
        '+201011111111',
      ),
    ).toBeNull();

    process.env.NODE_ENV =
      originalNodeEnv;
  });
});