import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthService } from './auth.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('AuthService - Session', () => {
  let prisma: PrismaService;
  let authService: AuthService;
  let userId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    authService = new AuthService(prisma);

    const user = await prisma.user.create({
      data: {
        email: `auth-test-${Date.now()}@makook.local`,
      },
    });

    userId = user.id;
  });

  afterAll(async () => {
    await prisma.session.deleteMany({
      where: { userId },
    });

    await prisma.user.delete({
      where: { id: userId },
    });

    await prisma.$disconnect();
  });

  it('creates a session and stores only the refresh token hash', async () => {
    const result = await authService.createSession(userId, 'test-device');

    expect(result.sessionId).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();

    expect(result.refreshToken.length).toBeGreaterThan(50);

    const session = await prisma.session.findUnique({
      where: { id: result.sessionId },
    });

    expect(session).not.toBeNull();
    expect(session?.userId).toBe(userId);
    expect(session?.deviceId).toBe('test-device');

    const expectedHash = createHash('sha256')
      .update(result.refreshToken)
      .digest('hex');

    expect(session?.refreshTokenHash).toBe(expectedHash);
    expect(session?.refreshTokenHash).not.toBe(result.refreshToken);
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
});
