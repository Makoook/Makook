import { createHash } from 'node:crypto';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  VerificationCodeType,
  UserStatus,
} from '../generated/prisma/enums.js';
import { OtpDeliveryService } from './otp/otp-delivery.service.js';
import { OtpService } from './otp/otp.service.js';
import { IdentityService } from '../identity/identity.service.js';

describe('AuthService - Session and Access Token', () => {
  let prisma: PrismaService;
  let authService: AuthService;
  let jwtService: JwtService;
  let otpService: OtpService;
  let deliveryService: OtpDeliveryService;
  let userId: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    jwtService = new JwtService({
      secret: process.env.JWT_ACCESS_SECRET,
      signOptions: {
        expiresIn: '15m',
      },
    });

    deliveryService = new OtpDeliveryService();
    otpService = new OtpService(prisma, deliveryService);
    authService = new AuthService(prisma, jwtService, otpService);

    const user = await prisma.user.create({
      data: {
        email: `auth-test-${Date.now()}@makook.local`,
      },
    });

    userId = user.id;
    createdUserIds.push(userId);
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.session.deleteMany({
        where: {
          userId: {
            in: createdUserIds,
          },
        },
      });

      await prisma.verificationCode.deleteMany({
        where: {
          userId: {
            in: createdUserIds,
          },
        },
      });

      await prisma.user.deleteMany({
        where: {
          id: {
            in: createdUserIds,
          },
        },
      });
    }

    await prisma.$disconnect();
  });

  it('creates a session and stores only the refresh token hash', async () => {
    const result = await authService.createSession(
      userId,
      'test-device',
    );

    expect(result.sessionId).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();

    expect(result.refreshToken.length).toBeGreaterThan(50);

    const session = await prisma.session.findUnique({
      where: {
        id: result.sessionId,
      },
    });

    expect(session).not.toBeNull();
    expect(session?.userId).toBe(userId);
    expect(session?.deviceId).toBe('test-device');
    expect(session?.familyId).toBeTruthy();

    const expectedHash = createHash('sha256')
      .update(result.refreshToken)
      .digest('hex');

    expect(session?.refreshTokenHash).toBe(expectedHash);

    expect(session?.refreshTokenHash).not.toBe(
      result.refreshToken,
    );
  });

  it('validates the correct refresh token', async () => {
    const result = await authService.createSession(userId);

    const session = await authService.validateRefreshToken(
      result.sessionId,
      result.refreshToken,
    );

    expect(session.id).toBe(result.sessionId);
    expect(session.userId).toBe(userId);
  });

  it('rejects an invalid refresh token', async () => {
    const result = await authService.createSession(userId);

    await expect(
      authService.validateRefreshToken(
        result.sessionId,
        'invalid-refresh-token',
      ),
    ).rejects.toThrow('Invalid refresh token');
  });

  it('rejects a revoked session', async () => {
    const result = await authService.createSession(userId);

    await authService.revokeSession(result.sessionId);

    await expect(
      authService.validateRefreshToken(
        result.sessionId,
        result.refreshToken,
      ),
    ).rejects.toThrow('Invalid session');
  });

  it('creates an access token with user and session identifiers', async () => {
    const sessionResult = await authService.createSession(userId);

    const accessToken = await authService.createAccessToken(
      userId,
      sessionResult.sessionId,
    );

    expect(accessToken).toBeTruthy();

    const payload = await jwtService.verifyAsync(accessToken);

    expect(payload.sub).toBe(userId);
    expect(payload.sid).toBe(sessionResult.sessionId);

    expect(payload.exp).toBeTypeOf('number');
    expect(payload.iat).toBeTypeOf('number');

    expect(payload.exp).toBeGreaterThan(payload.iat);

    const lifetimeSeconds = payload.exp - payload.iat;

    expect(lifetimeSeconds).toBe(15 * 60);
  });

  it('rotates the refresh token and creates a new session', async () => {
    const oldSession = await authService.createSession(
      userId,
      'rotation-test-device',
    );

    const rotationResult =
      await authService.rotateRefreshToken(
        oldSession.sessionId,
        oldSession.refreshToken,
      );

    expect(rotationResult.sessionId).toBeTruthy();
    expect(rotationResult.sessionId).not.toBe(
      oldSession.sessionId,
    );

    expect(rotationResult.refreshToken).toBeTruthy();
    expect(rotationResult.refreshToken).not.toBe(
      oldSession.refreshToken,
    );

    expect(rotationResult.accessToken).toBeTruthy();

    const oldSessionFromDatabase =
      await prisma.session.findUnique({
        where: {
          id: oldSession.sessionId,
        },
      });

    expect(oldSessionFromDatabase).not.toBeNull();
    expect(oldSessionFromDatabase?.revokedAt).not.toBeNull();
    expect(oldSessionFromDatabase?.familyId).toBeTruthy();

    const newSessionFromDatabase =
      await prisma.session.findUnique({
        where: {
          id: rotationResult.sessionId,
        },
      });

    expect(newSessionFromDatabase).not.toBeNull();

    expect(newSessionFromDatabase?.userId).toBe(userId);

    expect(newSessionFromDatabase?.deviceId).toBe(
      'rotation-test-device',
    );

    expect(newSessionFromDatabase?.familyId).toBe(
      oldSessionFromDatabase?.familyId,
    );

    expect(newSessionFromDatabase?.revokedAt).toBeNull();

    const expectedNewHash = createHash('sha256')
      .update(rotationResult.refreshToken)
      .digest('hex');

    expect(newSessionFromDatabase?.refreshTokenHash).toBe(
      expectedNewHash,
    );

    expect(newSessionFromDatabase?.refreshTokenHash).not.toBe(
      rotationResult.refreshToken,
    );
  });

  it('rejects the old refresh token after rotation', async () => {
    const oldSession = await authService.createSession(userId);

    const rotationResult =
      await authService.rotateRefreshToken(
        oldSession.sessionId,
        oldSession.refreshToken,
      );

    await expect(
      authService.validateRefreshToken(
        oldSession.sessionId,
        oldSession.refreshToken,
      ),
    ).rejects.toThrow('Invalid session');

    const newSession =
      await authService.validateRefreshToken(
        rotationResult.sessionId,
        rotationResult.refreshToken,
      );

    expect(newSession.id).toBe(
      rotationResult.sessionId,
    );

    expect(newSession.userId).toBe(userId);
  });

  it('creates an access token for the new session after rotation', async () => {
    const oldSession = await authService.createSession(userId);

    const rotationResult =
      await authService.rotateRefreshToken(
        oldSession.sessionId,
        oldSession.refreshToken,
      );

    const payload = await jwtService.verifyAsync(
      rotationResult.accessToken,
    );

    expect(payload.sub).toBe(userId);

    expect(payload.sid).toBe(
      rotationResult.sessionId,
    );

    expect(payload.exp).toBeTypeOf('number');
    expect(payload.iat).toBeTypeOf('number');

    expect(payload.exp - payload.iat).toBe(
      15 * 60,
    );
  });

  it('keeps the same session family when rotating a refresh token', async () => {
    const oldSession = await authService.createSession(
      userId,
      'family-test-device',
    );

    const oldSessionFromDatabase =
      await prisma.session.findUnique({
        where: {
          id: oldSession.sessionId,
        },
      });

    expect(oldSessionFromDatabase).not.toBeNull();
    expect(oldSessionFromDatabase?.familyId).toBeTruthy();

    const rotationResult =
      await authService.rotateRefreshToken(
        oldSession.sessionId,
        oldSession.refreshToken,
      );

    const newSessionFromDatabase =
      await prisma.session.findUnique({
        where: {
          id: rotationResult.sessionId,
        },
      });

    expect(newSessionFromDatabase).not.toBeNull();

    expect(newSessionFromDatabase?.familyId).toBe(
      oldSessionFromDatabase?.familyId,
    );
  });

  it('allows only one concurrent refresh using the same refresh token', async () => {
    const oldSession = await authService.createSession(
      userId,
      'concurrent-refresh-device',
    );

    const originalSession =
      await prisma.session.findUnique({
        where: {
          id: oldSession.sessionId,
        },
      });

    expect(originalSession).not.toBeNull();

    const familyId = originalSession!.familyId;

    const results = await Promise.allSettled([
      authService.rotateRefreshToken(
        oldSession.sessionId,
        oldSession.refreshToken,
      ),
      authService.rotateRefreshToken(
        oldSession.sessionId,
        oldSession.refreshToken,
      ),
    ]);

    const successful = results.filter(
      ({ status }) => status === 'fulfilled',
    );

    const rejected = results.filter(
      ({ status }) => status === 'rejected',
    );

    expect(successful).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const familySessions =
      await prisma.session.findMany({
        where: {
          familyId,
        },
      });

    const activeFamilySessions =
      familySessions.filter(
        (session) => session.revokedAt === null,
      );

    expect(activeFamilySessions).toHaveLength(1);

    expect(familySessions).toHaveLength(2);
  });

  it('revokes the entire session family when a rotated refresh token is replayed', async () => {
    const oldSession = await authService.createSession(
      userId,
      'replay-test-device',
    );

    const firstRotation =
      await authService.rotateRefreshToken(
        oldSession.sessionId,
        oldSession.refreshToken,
      );

    const oldSessionFromDatabase =
      await prisma.session.findUnique({
        where: {
          id: oldSession.sessionId,
        },
      });

    const newSessionFromDatabase =
      await prisma.session.findUnique({
        where: {
          id: firstRotation.sessionId,
        },
      });

    expect(oldSessionFromDatabase).not.toBeNull();
    expect(newSessionFromDatabase).not.toBeNull();

    expect(newSessionFromDatabase?.familyId).toBe(
      oldSessionFromDatabase?.familyId,
    );

    const familyId =
      newSessionFromDatabase!.familyId;

    await expect(
      authService.rotateRefreshToken(
        oldSession.sessionId,
        oldSession.refreshToken,
      ),
    ).rejects.toThrow('Invalid refresh token');

    const familySessions =
      await prisma.session.findMany({
        where: {
          familyId,
        },
      });

    expect(familySessions.length).toBe(2);

    expect(
      familySessions.every(
        (session) => session.revokedAt !== null,
      ),
    ).toBe(true);
  });

  it('authenticates a new email identifier and creates a session', async () => {
    const email = `otp-auth-email-${Date.now()}@makook.local`;

    const { user, code } =
      await requestOtpAndGetCode(
        VerificationCodeType.EMAIL,
        email,
      );

    expect(user.emailVerifiedAt).toBeNull();

    const result =
      await authService.authenticateWithOtp(
        VerificationCodeType.EMAIL,
        email,
        code,
        'email-device',
      );

    const session = await prisma.session.findUnique({
      where: {
        id: result.sessionId,
      },
    });

    const authenticatedUser =
      await prisma.user.findUnique({
        where: {
          id: user.id,
        },
      });

    const payload = await jwtService.verifyAsync(
      result.accessToken,
    );

    expect(
      authenticatedUser?.emailVerifiedAt,
    ).not.toBeNull();

    expect(session?.userId).toBe(user.id);
    expect(session?.deviceId).toBe('email-device');

    expect(session?.refreshTokenHash).toBe(
      createHash('sha256')
        .update(result.refreshToken)
        .digest('hex'),
    );

    expect(session?.refreshTokenHash).not.toBe(
      result.refreshToken,
    );

    expect(payload.sub).toBe(user.id);
    expect(payload.sid).toBe(result.sessionId);
  });

  it('authenticates a new phone identifier', async () => {
    const phone = `+201${Date.now()
      .toString()
      .slice(-10)}`;

    const { user, code } =
      await requestOtpAndGetCode(
        VerificationCodeType.PHONE,
        phone,
      );

    const result =
      await authService.authenticateWithOtp(
        VerificationCodeType.PHONE,
        phone,
        code,
      );

    const authenticatedUser =
      await prisma.user.findUnique({
        where: {
          id: user.id,
        },
      });

    expect(result.sessionId).toBeTruthy();

    expect(
      authenticatedUser?.phoneVerifiedAt,
    ).not.toBeNull();
  });

  it('authenticates an existing active user without replacing verification time', async () => {
    const email = `otp-auth-verified-${Date.now()}@makook.local`;

    const verifiedAt = new Date(
      '2026-01-01T00:00:00.000Z',
    );

    const user = await prisma.user.create({
      data: {
        email,
        emailVerifiedAt: verifiedAt,
      },
    });

    createdUserIds.push(user.id);

    const { code } =
      await requestOtpAndGetCode(
        VerificationCodeType.EMAIL,
        email,
      );

    const result =
      await authService.authenticateWithOtp(
        VerificationCodeType.EMAIL,
        email,
        code,
      );

    const authenticatedUser =
      await prisma.user.findUnique({
        where: {
          id: user.id,
        },
      });

    expect(result.sessionId).toBeTruthy();

    expect(
      authenticatedUser?.emailVerifiedAt,
    ).toEqual(verifiedAt);
  });

  it('uses the same email and phone normalization for identity and OTP authentication', async () => {
    const identityService =
      new IdentityService(prisma);

    const email =
      `otp-auth-normalized-${Date.now()}@makook.local`;

    const phone = `+201${Date.now()
      .toString()
      .slice(-10)}`;

    const emailUser =
      await identityService.createUser({
        email: `  ${email.toUpperCase()}  `,
      });

    const phoneUser =
      await identityService.createUser({
        phone: `  ${phone}  `,
      });

    createdUserIds.push(
      emailUser.id,
      phoneUser.id,
    );

    await otpService.requestOtp(
      VerificationCodeType.EMAIL,
      `  ${email.toUpperCase()}  `,
    );

    await otpService.requestOtp(
      VerificationCodeType.PHONE,
      `  ${phone}  `,
    );

    const emailCode =
      await otpService.getCodeForDevelopment(
        emailUser.id,
        VerificationCodeType.EMAIL,
      );

    const phoneCode =
      await otpService.getCodeForDevelopment(
        phoneUser.id,
        VerificationCodeType.PHONE,
      );

    await authService.authenticateWithOtp(
      VerificationCodeType.EMAIL,
      `  ${email.toUpperCase()}  `,
      emailCode,
    );

    await authService.authenticateWithOtp(
      VerificationCodeType.PHONE,
      `  ${phone}  `,
      phoneCode,
    );

    expect(emailUser.email).toBe(email);
    expect(phoneUser.phone).toBe(phone);
  });

  it.each([
    UserStatus.SUSPENDED,
    UserStatus.DELETED,
  ])(
    'does not authenticate a %s user',
    async (status) => {
      const email =
        `otp-auth-${status.toLowerCase()}-${Date.now()}@makook.local`;

      const user = await prisma.user.create({
        data: {
          email,
          status,
        },
      });

      createdUserIds.push(user.id);

      const code = await otpService.createCode(
        user.id,
        VerificationCodeType.EMAIL,
      );

      await expect(
        authService.authenticateWithOtp(
          VerificationCodeType.EMAIL,
          email,
          code,
        ),
      ).rejects.toThrow(
        'Invalid or expired verification code',
      );

      await expect(
        prisma.session.count({
          where: {
            userId: user.id,
          },
        }),
      ).resolves.toBe(0);
    },
  );

  it('returns the generic failure for unknown, wrong, expired, and used OTPs', async () => {
    const email =
      `otp-auth-failures-${Date.now()}@makook.local`;

    await expect(
      authService.authenticateWithOtp(
        VerificationCodeType.EMAIL,
        email,
        '123456',
      ),
    ).rejects.toThrow(
      'Invalid or expired verification code',
    );

    const { user, code } =
      await requestOtpAndGetCode(
        VerificationCodeType.EMAIL,
        email,
      );

    await expect(
      authService.authenticateWithOtp(
        VerificationCodeType.EMAIL,
        email,
        '000000',
      ),
    ).rejects.toThrow(
      'Invalid or expired verification code',
    );

    await prisma.verificationCode.updateMany({
      where: {
        userId: user.id,
        usedAt: null,
      },
      data: {
        expiresAt: new Date(Date.now() - 1),
      },
    });

    await expect(
      authService.authenticateWithOtp(
        VerificationCodeType.EMAIL,
        email,
        code,
      ),
    ).rejects.toThrow(
      'Invalid or expired verification code',
    );

    const replacement =
      await otpService.createCode(
        user.id,
        VerificationCodeType.EMAIL,
      );

    await authService.authenticateWithOtp(
      VerificationCodeType.EMAIL,
      email,
      replacement,
    );

    await expect(
      authService.authenticateWithOtp(
        VerificationCodeType.EMAIL,
        email,
        replacement,
      ),
    ).rejects.toThrow(
      'Invalid or expired verification code',
    );
  });

  it('returns the generic failure after the OTP attempt limit', async () => {
    const email =
      `otp-auth-attempts-${Date.now()}@makook.local`;

    const { code } =
      await requestOtpAndGetCode(
        VerificationCodeType.EMAIL,
        email,
      );

    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(
        authService.authenticateWithOtp(
          VerificationCodeType.EMAIL,
          email,
          '000000',
        ),
      ).rejects.toThrow(
        'Invalid or expired verification code',
      );
    }

    await expect(
      authService.authenticateWithOtp(
        VerificationCodeType.EMAIL,
        email,
        code,
      ),
    ).rejects.toThrow(
      'Invalid or expired verification code',
    );
  });

  it('allows at most one concurrent authentication for one OTP', async () => {
    const email =
      `otp-auth-concurrent-${Date.now()}@makook.local`;

    const { user, code } =
      await requestOtpAndGetCode(
        VerificationCodeType.EMAIL,
        email,
      );

    const results = await Promise.allSettled([
      authService.authenticateWithOtp(
        VerificationCodeType.EMAIL,
        email,
        code,
      ),
      authService.authenticateWithOtp(
        VerificationCodeType.EMAIL,
        email,
        code,
      ),
    ]);

    expect(
      results.filter(
        ({ status }) => status === 'fulfilled',
      ),
    ).toHaveLength(1);

    await expect(
      prisma.session.count({
        where: {
          userId: user.id,
        },
      }),
    ).resolves.toBe(1);
  });

  async function requestOtpAndGetCode(
    type: VerificationCodeType,
    identifier: string,
  ) {
    await otpService.requestOtp(
      type,
      identifier,
    );

    const user =
      await otpService.findUserByIdentifier(
        type,
        identifier,
      );

    if (!user) {
      throw new Error(
        'Expected OTP request to create a user',
      );
    }

    createdUserIds.push(user.id);

    const code =
      await otpService.getCodeForDevelopment(
        user.id,
        type,
      );

    return {
      user,
      code,
    };
  }
});