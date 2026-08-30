import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  createHash,
  randomBytes,
  randomUUID,
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
    return createHash('sha256')
      .update(token)
      .digest('hex');
  }

  private hashesMatch(
    left: string,
    right: string,
  ): boolean {
    const leftBuffer = Buffer.from(left, 'hex');
    const rightBuffer = Buffer.from(right, 'hex');

    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }

  private async tryLockRefreshSession(
    tx: Prisma.TransactionClient,
    sessionId: string,
  ): Promise<boolean> {
    const result = await tx.$queryRaw<
      Array<{ locked: boolean }>
    >`
      SELECT pg_try_advisory_xact_lock(
        hashtextextended(
          ${`refresh-session:${sessionId}`},
          0
        )
      ) AS locked
    `;

    return result[0]?.locked === true;
  }

  private async lockSessionFamily(
    tx: Prisma.TransactionClient,
    familyId: string,
  ): Promise<void> {
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(
        hashtextextended(
          ${`refresh-family:${familyId}`},
          0
        )
      )
    `;
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
    const user =
      await this.otpService.findUserByIdentifier(
        type,
        identifier,
      );

    if (!user) {
      throw new UnauthorizedException(
        'Invalid or expired verification code',
      );
    }

    const session =
      await this.otpService.verifyCode(
        user.id,
        type,
        code,
        (tx, userId) =>
          this.createSessionWithClient(
            tx,
            userId,
            deviceId,
          ),
      );

    const accessToken =
      await this.createAccessToken(
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
    const session =
      await this.prisma.session.findUnique({
        where: {
          id: sessionId,
        },
      });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    ) {
      throw new UnauthorizedException(
        'Invalid session',
      );
    }

    const refreshTokenHash =
      this.hashRefreshToken(refreshToken);

    if (
      !this.hashesMatch(
        refreshTokenHash,
        session.refreshTokenHash,
      )
    ) {
      throw new UnauthorizedException(
        'Invalid refresh token',
      );
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
    const newRefreshToken =
      this.generateRefreshToken();

    const newRefreshTokenHash =
      this.hashRefreshToken(
        newRefreshToken,
      );

    const newExpiresAt = new Date();

    newExpiresAt.setDate(
      newExpiresAt.getDate() + 30,
    );

    const result =
      await this.prisma.$transaction(
        async (tx) => {
          /*
           * Do not wait for another refresh request
           * using the same session.
           *
           * If another request currently owns this
           * lock, this is a concurrent refresh attempt.
           */
          const lockAcquired =
            await this.tryLockRefreshSession(
              tx,
              sessionId,
            );

          if (!lockAcquired) {
            throw new UnauthorizedException(
              'Invalid refresh token',
            );
          }

          const session =
            await tx.session.findUnique({
              where: {
                id: sessionId,
              },
            });

          if (!session) {
            throw new UnauthorizedException(
              'Invalid session',
            );
          }

          /*
           * Lock the complete session family.
           *
           * This protects family-wide replay
           * revocation.
           */
          await this.lockSessionFamily(
            tx,
            session.familyId,
          );

          /*
           * Re-read after acquiring the family lock.
           */
          const currentSession =
            await tx.session.findUnique({
              where: {
                id: sessionId,
              },
            });

          if (
            !currentSession ||
            currentSession.expiresAt <= new Date()
          ) {
            throw new UnauthorizedException(
              'Invalid session',
            );
          }

          const refreshTokenHash =
            this.hashRefreshToken(
              refreshToken,
            );

          /*
           * REPLAY DETECTION
           *
           * The session is already revoked and the
           * presented token matches the original token.
           *
           * This is a genuine refresh-token replay.
           *
           * Revoke EVERY session in the family,
           * including sessions already revoked.
           *
           * We return "replay" instead of throwing here,
           * because throwing inside the transaction would
           * rollback the family revocation.
           */
          if (currentSession.revokedAt) {
            const isReplay =
              this.hashesMatch(
                refreshTokenHash,
                currentSession.refreshTokenHash,
              );

            if (isReplay) {
              await tx.session.updateMany({
                where: {
                  familyId:
                    currentSession.familyId,
                },
                data: {
                  revokedAt: new Date(),
                },
              });

              return {
                kind: 'replay' as const,
              };
            }

            return {
              kind: 'invalid' as const,
            };
          }

          /*
           * Active session but incorrect token.
           */
          if (
            !this.hashesMatch(
              refreshTokenHash,
              currentSession.refreshTokenHash,
            )
          ) {
            return {
              kind: 'invalid' as const,
            };
          }

          /*
           * Revoke the current session.
           */
          const revokedAt = new Date();

          await tx.session.update({
            where: {
              id: currentSession.id,
            },
            data: {
              revokedAt,
            },
          });

          /*
           * Create the replacement session in the
           * SAME session family.
           */
          const newSession =
            await tx.session.create({
              data: {
                userId:
                  currentSession.userId,
                familyId:
                  currentSession.familyId,
                refreshTokenHash:
                  newRefreshTokenHash,
                deviceId:
                  currentSession.deviceId,
                expiresAt:
                  newExpiresAt,
              },
            });

          return {
            kind: 'success' as const,
            userId:
              currentSession.userId,
            sessionId: newSession.id,
            refreshToken: newRefreshToken,
          };
        },
      );

    /*
     * The transaction has already committed here.
     *
     * Therefore, if this was a replay, the family
     * revocation has already been permanently saved.
     */
    if (
      result.kind === 'replay' ||
      result.kind === 'invalid'
    ) {
      throw new UnauthorizedException(
        'Invalid refresh token',
      );
    }

    const accessToken =
      await this.createAccessToken(
        result.userId,
        result.sessionId,
      );

    return {
      sessionId: result.sessionId,
      refreshToken: result.refreshToken,
      accessToken,
    };
  }

  async revokeSession(
    sessionId: string,
  ): Promise<void> {
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
    client:
      | Prisma.TransactionClient
      | PrismaService,
    userId: string,
    deviceId?: string,
  ): Promise<{
    sessionId: string;
    refreshToken: string;
  }> {
    const refreshToken =
      this.generateRefreshToken();

    const refreshTokenHash =
      this.hashRefreshToken(
        refreshToken,
      );

    const expiresAt = new Date();

    expiresAt.setDate(
      expiresAt.getDate() + 30,
    );

    const session =
      await client.session.create({
        data: {
          userId,
          familyId: randomUUID(),
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