import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  private generateRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async createSession(
    userId: string,
    deviceId?: string,
  ): Promise<{
    sessionId: string;
    refreshToken: string;
  }> {
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

  async createAccessToken(
    userId: string,
    sessionId: string,
  ): Promise<string> {
    return this.jwtService.signAsync({
      sub: userId,
      sid: sessionId,
    });
  }

  async validateRefreshToken(
    sessionId: string,
    refreshToken: string,
  ) {
    const session = await this.prisma.session.findUnique({
      where: {
        id: sessionId,
      },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    ) {
      throw new UnauthorizedException('Invalid session');
    }

    const refreshTokenHash = this.hashRefreshToken(refreshToken);

    if (refreshTokenHash !== session.refreshTokenHash) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return session;
  }

  async rotateRefreshToken(
    sessionId: string,
    refreshToken: string,
  ): Promise<{
    sessionId: string;
    refreshToken: string;
    accessToken: string;
  }> {
    const session = await this.validateRefreshToken(
      sessionId,
      refreshToken,
    );

    const newRefreshToken = this.generateRefreshToken();

    const newRefreshTokenHash =
      this.hashRefreshToken(newRefreshToken);

    const newExpiresAt = new Date();

    newExpiresAt.setDate(newExpiresAt.getDate() + 30);

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.session.update({
        where: {
          id: session.id,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      const newSession = await tx.session.create({
        data: {
          userId: session.userId,
          refreshTokenHash: newRefreshTokenHash,
          deviceId: session.deviceId,
          expiresAt: newExpiresAt,
        },
      });

      return newSession;
    });

    const accessToken = await this.createAccessToken(
      session.userId,
      result.id,
    );

    return {
      sessionId: result.id,
      refreshToken: newRefreshToken,
      accessToken,
    };
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