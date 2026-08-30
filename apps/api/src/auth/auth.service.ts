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

  /**
   * Attempts to acquire a transaction-scoped lock
   * for one refresh session.
   *
   * If another request is already processing the same
   * session, the second request fails immediately.
   *
   * This prevents two concurrent requests using the
   * same refresh token from both rotating it.
   */
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

  /**
   * Serializes operations belonging to the same
   * refresh-token family.
   */
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
           * STEP 1
           *
           * Try to lock this exact refresh session.
           *
           * If another request is currently refreshing
           * this same session, do not wait for it.
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

          /*
           * STEP 2
           *
           * Load the session.
           */
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
           * STEP 3
           *
           * Lock the session family.
           */
          await this.lockSessionFamily(
            tx,
            session.familyId,
          );

          /*
           * STEP 4
           *
           * Re-read the session after acquiring
           * the family lock.
           */
          const currentSession =
            await tx.session.findUnique({
              where: {
                id: sessionId,
              },
            });

          if (!currentSession) {
            throw new UnauthorizedException(
              'Invalid session',
            );
          }

          /*
           * STEP 5
           *
           * Check expiration.
           */
          if (
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
           * STEP 6
           *
           * If the session is already revoked, determine
           * whether this is a real refresh-token replay.
           */
          if (currentSession.revokedAt) {
            const isReplay =
              this.hashesMatch(
                refreshTokenHash,
                currentSession.refreshTokenHash,
              );

            if (isReplay) {
              /*
               * IMPORTANT:
               *
               * Do NOT throw here.
               *
               * Throwing inside the Prisma transaction
               * would rollback this updateMany().
               *
               * We need the family revocation to COMMIT first.
               */
              await tx.session.updateMany({
                where: {
                  familyId:
                    currentSession.familyId,
                  revokedAt: null,
                },
                data: {
                  revokedAt: new Date(),
                },
              });

              /*
               * Return a replay marker.
               *
               * The transaction will now commit.
               */
              return {
                kind: 'replay' as const,
              };
            }

            return {
              kind: 'invalid' as const,
            };
          }

          /*
           * STEP 7
           *
           * Verify that the supplied refresh token belongs
           * to this active session.
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
           * STEP 8
           *
           * Revoke the old session.
           */
          await tx.session.update({
            where: {
              id: currentSession.id,
            },
            data: {
              revokedAt: new Date(),
            },
          });

          /*
           * STEP 9
           *
           * Create the new session using the SAME familyId.
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
            sessionId:
              newSession.id,
          };
        },
      );

    /*
     * IMPORTANT:
     *
     * These errors are intentionally thrown AFTER
     * the transaction has completed.
     *
     * Therefore a replay can revoke the entire family
     * and the revocation remains committed.
     */
    if (result.kind === 'replay') {
      throw new UnauthorizedException(
        'Invalid refresh token',
      );
    }

    if (result.kind === 'invalid') {
      throw new UnauthorizedException(
        'Invalid refresh token',
      );
    }

    /*
     * Only a successful rotation reaches this point.
     */
    const accessToken =
      await this.createAccessToken(
        result.userId,
        result.sessionId,
      );

    return {
      sessionId:
        result.sessionId,
      refreshToken:
        newRefreshToken,
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