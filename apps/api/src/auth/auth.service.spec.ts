import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('AuthService - Session and Access Token', () => {
  let prisma: PrismaService;
  let authService: AuthService;
  let jwtService: JwtService;
  let userId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    jwtService = new JwtService({
      secret: process.env.JWT_ACCESS_SECRET,
      signOptions: {
        expiresIn: '15m',
      },
    });

    authService = new AuthService(prisma, jwtService);

    const user = await prisma.user.create({
      data: {
        email: `auth-test-${Date.now()}@makook.local`,
      },
    });

    userId = user.id;
  });

  afterAll(async () => {
    if (userId) {
      await prisma.session.deleteMany({
        where: {
          userId,
        },
      });

      await prisma.user.delete({
        where: {
          id: userId,
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
});