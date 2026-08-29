import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  private generateRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async createSession(
    userId: string,
    deviceId?: string,
  ): Promise<{ sessionId: string; refreshToken: string }> {
    const refreshToken = this.generateRefreshToken();
    const refreshTokenHash = this.hashRefreshToken(refreshToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const session = await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash,
        deviceId,
        expiresAt,
      },
    });

    return {
      sessionId: session.id,
      refreshToken,
    };
  }

  async validateRefreshToken(
    sessionId: string,
    refreshToken: string,
  ) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    ) {
      throw new UnauthorizedException('Invalid session');
    }

    const hash = this.hashRefreshToken(refreshToken);

    if (hash !== session.refreshTokenHash) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return session;
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: {
        id: sessionId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }
}
