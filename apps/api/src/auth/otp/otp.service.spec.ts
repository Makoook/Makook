import { createHash } from 'node:crypto';
import {
  OtpDeliveryService,
} from './otp-delivery.service.js';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';
import { VerificationCodeType } from '../../generated/prisma/enums.js';
import { OtpService } from './otp.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { IdentityService } from '../../identity/identity.service.js';

describe('OtpService', () => {
  let prisma: PrismaService;
  let otpService: OtpService;
  let deliveryService: OtpDeliveryService;
  let userId: string;
  let userEmail: string;
  let userPhone: string;

  beforeAll(async () => {
    prisma = new PrismaService();

    await prisma.$connect();

    deliveryService =
  new OtpDeliveryService();

    otpService =
  new OtpService(
    prisma,
    deliveryService,
  );

    userEmail = `otp-test-${Date.now()}@makook.local`;
    userPhone = `+2010${Date.now().toString().slice(-8)}`;
    const user = await prisma.user.create({
      data: {
        email: userEmail,
        phone: userPhone,
      },
    });

    userId = user.id;
  });

  afterAll(async () => {
    await prisma.verificationCode.deleteMany({
      where: {
        userId,
      },
    });

    await prisma.user.delete({
      where: {
        id: userId,
      },
    });

    await prisma.$disconnect();
  });

  it('creates a six-digit email verification code', async () => {
    const code = await otpService.createCode(
      userId,
      VerificationCodeType.EMAIL,
    );

    expect(code).toMatch(/^\d{6}$/);

    const record =
      await prisma.verificationCode.findFirst({
        where: {
          userId,
          type: VerificationCodeType.EMAIL,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

    expect(record).not.toBeNull();

    const expectedHash = createHash(
      'sha256',
    )
      .update(code)
      .digest('hex');

    expect(record?.codeHash).toBe(
      expectedHash,
    );

    expect(record?.codeHash).not.toBe(
      code,
    );

    expect(record?.usedAt).toBeNull();

    expect(record?.attempts).toBe(0);

    expect(
      record!.expiresAt.getTime(),
    ).toBeGreaterThan(Date.now());
  });

  it('creates a six-digit phone verification code', async () => {
    const code = await otpService.createCode(
      userId,
      VerificationCodeType.PHONE,
    );

    expect(code).toMatch(/^\d{6}$/);

    const record =
      await prisma.verificationCode.findFirst({
        where: {
          userId,
          type: VerificationCodeType.PHONE,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

    expect(record).not.toBeNull();
    expect(record?.usedAt).toBeNull();
    expect(record?.attempts).toBe(0);
  });

  it('invalidates the previous email code', async () => {
    const firstCode =
      await otpService.createCode(
        userId,
        VerificationCodeType.EMAIL,
      );

    const firstRecord =
      await prisma.verificationCode.findFirst({
        where: {
          userId,
          type: VerificationCodeType.EMAIL,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

    expect(firstRecord).not.toBeNull();

    await otpService.createCode(
      userId,
      VerificationCodeType.EMAIL,
    );

    const updatedFirstRecord =
      await prisma.verificationCode.findUnique({
        where: {
          id: firstRecord!.id,
        },
      });

    expect(updatedFirstRecord?.usedAt).not.toBeNull();

    await expect(
      otpService.verifyCode(
        userId,
        VerificationCodeType.EMAIL,
        firstCode,
      ),
    ).rejects.toThrow(
      'Invalid or expired verification code',
    );
  });

  it('verifies a valid email code', async () => {
    const code = await otpService.createCode(
      userId,
      VerificationCodeType.EMAIL,
    );

    await otpService.verifyCode(
      userId,
      VerificationCodeType.EMAIL,
      code,
    );

    const user =
      await prisma.user.findUnique({
        where: {
          id: userId,
        },
      });

    expect(
      user?.emailVerifiedAt,
    ).not.toBeNull();

    const record =
      await prisma.verificationCode.findFirst({
        where: {
          userId,
          type: VerificationCodeType.EMAIL,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

    expect(record?.usedAt).not.toBeNull();
  });

  it('verifies a valid phone code', async () => {
    const code = await otpService.createCode(
      userId,
      VerificationCodeType.PHONE,
    );

    await otpService.verifyCode(
      userId,
      VerificationCodeType.PHONE,
      code,
    );

    const user =
      await prisma.user.findUnique({
        where: {
          id: userId,
        },
      });

    expect(
      user?.phoneVerifiedAt,
    ).not.toBeNull();
  });

  it('rejects an invalid code and increments attempts', async () => {
    await otpService.createCode(
      userId,
      VerificationCodeType.EMAIL,
    );

    const record =
      await prisma.verificationCode.findFirst({
        where: {
          userId,
          type: VerificationCodeType.EMAIL,
          usedAt: null,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

    expect(record).not.toBeNull();

    await expect(
      otpService.verifyCode(
        userId,
        VerificationCodeType.EMAIL,
        '000000',
      ),
    ).rejects.toThrow(
      'Invalid or expired verification code',
    );

    const updatedRecord =
      await prisma.verificationCode.findUnique({
        where: {
          id: record!.id,
        },
      });

    expect(updatedRecord?.attempts).toBe(1);
  });

  it('rejects a code after five failed attempts', async () => {
    const code = await otpService.createCode(
      userId,
      VerificationCodeType.EMAIL,
    );

    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(
        otpService.verifyCode(
          userId,
          VerificationCodeType.EMAIL,
          '000000',
        ),
      ).rejects.toThrow(
        'Invalid or expired verification code',
      );
    }

    const record =
      await prisma.verificationCode.findFirst({
        where: {
          userId,
          type: VerificationCodeType.EMAIL,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

    expect(record?.attempts).toBe(5);
    expect(record?.usedAt).not.toBeNull();

    await expect(
      otpService.verifyCode(
        userId,
        VerificationCodeType.EMAIL,
        code,
      ),
    ).rejects.toThrow(
      'Invalid or expired verification code',
    );
  });

  it('cannot reuse a verified code', async () => {
    const code = await otpService.createCode(
      userId,
      VerificationCodeType.EMAIL,
    );

    await otpService.verifyCode(
      userId,
      VerificationCodeType.EMAIL,
      code,
    );

    await expect(
      otpService.verifyCode(
        userId,
        VerificationCodeType.EMAIL,
        code,
      ),
    ).rejects.toThrow(
      'Invalid or expired verification code',
    );
  });

  it('allows only one concurrent OTP request during the cooldown', async () => {
    const concurrentEmail =
      `otp-concurrent-${Date.now()}@makook.local`;

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        otpService.requestOtp(
          VerificationCodeType.EMAIL,
          concurrentEmail,
        ),
      ),
    );

    expect(
      results.filter(
        (result) => result.status === 'fulfilled',
      ),
    ).toHaveLength(1);

    expect(
      results.filter(
        (result) => result.status === 'rejected',
      ),
    ).toHaveLength(9);

    const user =
      await prisma.user.findUnique({
        where: {
          email: concurrentEmail,
        },
      });

    expect(user).not.toBeNull();

    const activeCodes =
      await prisma.verificationCode.count({
        where: {
          userId: user!.id,
          type: VerificationCodeType.EMAIL,
          usedAt: null,
        },
      });

    expect(activeCodes).toBe(1);

    const identifierHash =
      createHash('sha256')
        .update(concurrentEmail)
        .digest('hex');

    await prisma.otpRequestLimit.deleteMany({
      where: {
        identifierHash,
        type: VerificationCodeType.EMAIL,
      },
    });

    await prisma.verificationCode.deleteMany({
      where: {
        userId: user!.id,
      },
    });

    await prisma.user.delete({
      where: {
        id: user!.id,
      },
    });
  });

  it('rejects repeated OTP requests during the cooldown window', async () => {
    const limitedEmail =
      `otp-limit-${Date.now()}@makook.local`;

    await otpService.requestOtp(
      VerificationCodeType.EMAIL,
      limitedEmail,
    );

    await expect(
      otpService.requestOtp(
        VerificationCodeType.EMAIL,
        limitedEmail,
      ),
    ).rejects.toThrow(
      'Please wait before requesting another verification code',
    );

    const identifierHash =
      createHash('sha256')
        .update(limitedEmail)
        .digest('hex');

    const limitRecord =
      await prisma.otpRequestLimit.findUnique({
        where: {
          identifierHash_type: {
            identifierHash,
            type: VerificationCodeType.EMAIL,
          },
        },
      });

    expect(limitRecord).not.toBeNull();
    expect(limitRecord?.requestCount).toBe(1);

    const user =
      await prisma.user.findUnique({
        where: {
          email: limitedEmail,
        },
      });

    expect(user).not.toBeNull();

    await prisma.otpRequestLimit.delete({
      where: {
        id: limitRecord!.id,
      },
    });

    await prisma.verificationCode.deleteMany({
      where: {
        userId: user!.id,
      },
    });

    await prisma.user.delete({
      where: {
        id: user!.id,
      },
    });
  });

  it('enforces the shared E.164 phone policy at the service boundary', async () => {
    await expect(
      otpService.requestOtp(
        VerificationCodeType.PHONE,
        '  01000000000  ',
      ),
    ).rejects.toThrow('identifier must be a valid email or international phone number');

    await expect(
      otpService.findUserByIdentifier(
        VerificationCodeType.PHONE,
        '01000000000',
      ),
    ).rejects.toThrow('identifier must be a valid email or international phone number');

    await expect(
      new IdentityService(prisma).createUser({
        phone: '01000000000',
      }),
    ).rejects.toThrow('phone and email must be valid normalized identifiers');

    await otpService.requestOtp(
      VerificationCodeType.PHONE,
      `  ${userPhone}  `,
    );

    const normalizedUser = await otpService.findUserByIdentifier(
      VerificationCodeType.PHONE,
      userPhone,
    );
    expect(normalizedUser?.id).toBe(userId);
  });
});
