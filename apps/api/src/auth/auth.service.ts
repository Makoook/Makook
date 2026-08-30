import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { VerificationCodeType } from '../generated/prisma/enums.js';
import { OtpService } from './otp/otp.service.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly otpService: OtpService,
  ) {}

  private generateRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private hashesMatch(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, 'hex');
    const rightBuffer = Buffer.from(right, 'hex');

    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }

  async createSession(
    userId: string,
    deviceId?: string,
  ): Promise<{
    sessionId: string;
    refreshToken: string;
  }> {
    return this.createSessionWithClient(
      this.prisma,
      userId,
      deviceId,
    );
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

  async authenticateWithOtp(
    type: VerificationCodeType,
    identifier: string,
    code: string,
    deviceId?: string,
  ): Promise<{
    sessionId: string;
    refreshToken: string;
    accessToken: string;
  }> {
    const user = await this.otpService.findUserByIdentifier(
      type,
      identifier,
    );

    if (!user) {
      throw new UnauthorizedException(
        'Invalid or expired verification code',
      );
    }

    const session = await this.otpService.verifyCode(
      user.id,
      type,
      code,
      (tx, userId) =>
        this.createSessionWithClient(tx, userId, deviceId),
    );

    const accessToken = await this.createAccessToken(
      user.id,
      session.sessionId,
    );

    return {
      sessionId: session.sessionId,
      refreshToken: session.refreshToken,
      accessToken,
    };
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

    if (!this.hashesMatch(refreshTokenHash, session.refreshTokenHash)) {
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

  private async createSessionWithClient(
    client: Prisma.TransactionClient | PrismaService,
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

    const session = await client.session.create({
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
}
