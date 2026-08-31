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
   * Serializes refresh operations for one session.
   *
   * This is a blocking transaction-scoped advisory lock.
   * A concurrent request using the same refresh session
   * waits for the first transaction to finish and then
   * re-checks the session state.
   */
  private async lockRefreshSession(
    tx: Prisma.TransactionClient,
    sessionId: string,
  ): Promise<void> {
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(
        hashtextextended(
          ${`refresh-session:${sessionId}`},
          0
        )
      )
    `;
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

    const graceSeconds =
      Number.parseInt(
        process.env.REFRESH_TOKEN_GRACE_SECONDS ??
          '5',
        10,
      );

    const refreshGraceWindowMs =
      Number.isFinite(graceSeconds) &&
      graceSeconds > 0
        ? graceSeconds * 1000
        : 5000;

    const result =
      await this.prisma.$transaction(
        async (tx) => {
          /*
           * STEP 1
           *
           * Serialize refresh operations for this exact
           * session. A concurrent request waits for the
           * first transaction to finish.
           */
          await this.lockRefreshSession(
            tx,
            sessionId,
          );

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
           * Serialize operations for the entire family.
           */
          await this.lockSessionFamily(
            tx,
            session.familyId,
          );

          /*
           * STEP 4
           *
           * Re-read the session after both locks have
           * been acquired.
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
           * The session is already revoked.
           *
           * There are two possible cases:
           *
           * A) This session was legitimately rotated and
           *    the old token is being retried during the
           *    short grace window.
           *
           * B) The old token is being replayed outside the
           *    grace window.
           *
           * The replacement relationship tells us whether
           * this session was actually rotated.
           */
          if (currentSession.revokedAt) {
            const tokenMatches =
              this.hashesMatch(
                refreshTokenHash,
                currentSession.refreshTokenHash,
              );

            if (!tokenMatches) {
              return {
                kind: 'invalid' as const,
              };
            }

            /*
             * Only a session that has a known replacement
             * can enter the grace path.
             */
            if (
              currentSession.replacedBySessionId
            ) {
              const graceDeadline =
                currentSession.revokedAt.getTime() +
                refreshGraceWindowMs;

              const graceStillValid =
                Date.now() <= graceDeadline;

              if (
                graceStillValid &&
                !currentSession.graceConsumedAt
              ) {
                /*
                 * Consume the grace exactly once.
                 *
                 * We intentionally do NOT return the new
                 * refresh token here. The plaintext token
                 * exists only in the original successful
                 * response and is never stored in the DB.
                 */
                await tx.session.update({
                  where: {
                    id: currentSession.id,
                  },
                  data: {
                    graceConsumedAt:
                      new Date(),
                  },
                });

                return {
                  kind: 'grace' as const,
                };
              }
            }

            /*
             * The old token is now a genuine replay.
             *
             * Revoke every still-active session in the
             * family. This operation remains inside the
             * transaction and therefore commits together
             * with the replay marker.
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

            return {
              kind: 'replay' as const,
            };
          }

          /*
           * STEP 7
           *
           * The session is active. Verify that the supplied
           * refresh token belongs to this session.
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
           * Revoke the old session and create its
           * replacement as one atomic transaction.
           */
          const revokedAt = new Date();

          const revokedSession =
            await tx.session.update({
              where: {
                id: currentSession.id,
              },
              data: {
                revokedAt,
              },
            });

          /*
           * STEP 9
           *
           * Create the replacement session in the same
           * refresh-token family.
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

          /*
           * STEP 10
           *
           * Link the old session to the exact replacement.
           *
           * This relationship is what distinguishes a
           * rotated session from an independently revoked
           * session.
           */
          await tx.session.update({
            where: {
              id: revokedSession.id,
            },
            data: {
              replacedBySessionId:
                newSession.id,
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
     * The transaction has completed at this point.
     *
     * Replay/invalid/grace failures are therefore thrown
     * after the transaction so database changes such as
     * family revocation or grace consumption are committed.
     */
    if (
      result.kind === 'replay' ||
      result.kind === 'invalid' ||
      result.kind === 'grace'
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