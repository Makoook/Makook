import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  createHash,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import {
  PrismaService,
} from '../../prisma/prisma.service.js';
import {
  VerificationCodeType,
  UserStatus,
} from '../../generated/prisma/enums.js';
import { Prisma } from '../../generated/prisma/client.js';
import {
  isValidIdentifier,
  normalizeIdentifier,
} from '../../identity/identifier-normalizer.js';
import {
  OtpDeliveryService,
} from './otp-delivery.service.js';

@Injectable()
export class OtpService {
  private readonly codeLifetimeMs =
    5 * 60 * 1000;

  private readonly maximumAttempts = 5;

  private readonly invalidCodeMessage =
    'Invalid or expired verification code';

  constructor(
    private readonly prisma: PrismaService,
    private readonly deliveryService: OtpDeliveryService,
  ) {}

  private generateCode(): string {
    const minimum = 100000;
    const maximum = 1000000;

    return randomInt(
      minimum,
      maximum,
    ).toString();
  }

  private hashCode(
    code: string,
  ): string {
    return createHash('sha256')
      .update(code)
      .digest('hex');
  }

  private hashesMatch(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, 'hex');
    const rightBuffer = Buffer.from(right, 'hex');

    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }

  private async lockOtp(
    tx: Prisma.TransactionClient,
    userId: string,
    type: VerificationCodeType,
  ): Promise<void> {
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${`${userId}:${type}`}, 0)
      )
    `;
  }

  async findUserByIdentifier(
    type: VerificationCodeType,
    identifier: string,
  ) {
    const normalizedIdentifier = this.normalizeAndValidateIdentifier(
      type,
      identifier,
    );

    if (type === VerificationCodeType.EMAIL) {
      return this.prisma.user.findUnique({
        where: {
          email: normalizedIdentifier,
        },
      });
    }

    if (type === VerificationCodeType.PHONE) {
      return this.prisma.user.findUnique({
        where: {
          phone: normalizedIdentifier,
        },
      });
    }

    return null;
  }

  async requestOtp(
    type: VerificationCodeType,
    identifier: string,
  ): Promise<void> {
    const normalizedIdentifier = this.normalizeAndValidateIdentifier(
      type,
      identifier,
    );
    const user = await this.findOrCreateUser(
      type,
      normalizedIdentifier,
    );

    if (user.status !== UserStatus.ACTIVE) {
      return;
    }

    const code =
      this.generateCode();

    const codeHash =
      this.hashCode(code);

    const expiresAt =
      new Date(
        Date.now() +
          this.codeLifetimeMs,
      );

    await this.prisma.$transaction(
      async (tx) => {
        await this.lockOtp(tx, user.id, type);

        await tx.verificationCode.updateMany({
          where: {
            userId: user.id,
            type,
            usedAt: null,
          },
          data: {
            usedAt: new Date(),
          },
        });

        await tx.verificationCode.create({
          data: {
            userId: user.id,
            type,
            codeHash,
            expiresAt,
          },
        });
      },
    );

    await this.deliveryService.send({
      type,
      identifier: normalizedIdentifier,
      code,
    });
  }

  async createCode(
    userId: string,
    type: VerificationCodeType,
  ): Promise<string> {
    const code =
      this.generateCode();

    const codeHash =
      this.hashCode(code);

    const expiresAt =
      new Date(
        Date.now() +
          this.codeLifetimeMs,
      );

    await this.prisma.$transaction(async (tx) => {
      await this.lockOtp(tx, userId, type);

      await tx.verificationCode.updateMany({
        where: {
          userId,
          type,
          usedAt: null,
        },
        data: {
          usedAt: new Date(),
        },
      });

      await tx.verificationCode.create({
        data: {
          userId,
          type,
          codeHash,
          expiresAt,
        },
      });
    });

    return code;
  }

  async verifyCode<T = void>(
    userId: string,
    type: VerificationCodeType,
    code: string,
    onVerified?: (
      tx: Prisma.TransactionClient,
      verifiedUserId: string,
    ) => Promise<T>,
  ): Promise<T> {
    const codeHash = this.hashCode(code);
    const now = new Date();
    let identifier = '';

    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockOtp(tx, userId, type);

      const verificationCode = await tx.verificationCode.findFirst({
        where: {
          userId,
          type,
          usedAt: null,
        },
        orderBy: [
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        include: {
          user: true,
        },
      });

      if (
        !verificationCode ||
        verificationCode.expiresAt <= now ||
        verificationCode.attempts >= this.maximumAttempts ||
        verificationCode.user.status !== UserStatus.ACTIVE
      ) {
        return { valid: false as const };
      }

      if (!this.hashesMatch(codeHash, verificationCode.codeHash)) {
        const updated = await tx.verificationCode.updateMany({
          where: {
            id: verificationCode.id,
            usedAt: null,
            attempts: {
              lt: this.maximumAttempts,
            },
          },
          data: {
            attempts: {
              increment: 1,
            },
          },
        });

        if (updated.count === 1) {
          await tx.verificationCode.updateMany({
            where: {
              id: verificationCode.id,
              usedAt: null,
              attempts: {
                gte: this.maximumAttempts,
              },
            },
            data: {
              usedAt: now,
            },
          });
        }

        return { valid: false as const };
      }

      const activeUser = await tx.user.updateMany({
        where: {
          id: userId,
          status: UserStatus.ACTIVE,
        },
        data: {
          updatedAt: now,
        },
      });

      if (activeUser.count !== 1) {
        return { valid: false as const };
      }

      const consumed = await tx.verificationCode.updateMany({
        where: {
          id: verificationCode.id,
          usedAt: null,
          codeHash,
          expiresAt: {
            gt: now,
          },
          attempts: {
            lt: this.maximumAttempts,
          },
        },
        data: {
          usedAt: now,
        },
      });

      if (consumed.count !== 1) {
        return { valid: false as const };
      }

      if (type === VerificationCodeType.EMAIL) {
        await tx.user.updateMany({
          where: {
            id: userId,
            status: UserStatus.ACTIVE,
            emailVerifiedAt: null,
          },
          data: {
            emailVerifiedAt: now,
          },
        });
      } else {
        await tx.user.updateMany({
          where: {
            id: userId,
            status: UserStatus.ACTIVE,
            phoneVerifiedAt: null,
          },
          data: {
            phoneVerifiedAt: now,
          },
        });
      }

      identifier = type === VerificationCodeType.EMAIL
        ? verificationCode.user.email ?? ''
        : verificationCode.user.phone ?? '';

      if (!onVerified) {
        return { valid: true as const, value: undefined as T };
      }

      return {
        valid: true as const,
        value: await onVerified(tx, userId),
      };
    });

    if (!result.valid) {
      throw new UnauthorizedException(this.invalidCodeMessage);
    }

    this.deliveryService.clearDevelopmentCode(type, identifier);

    return result.value;
  }

  private async findOrCreateUser(
    type: VerificationCodeType,
    identifier: string,
  ) {
    if (type === VerificationCodeType.EMAIL) {
      return this.prisma.user.upsert({
        where: { email: identifier },
        update: {},
        create: { email: identifier },
      });
    }

    return this.prisma.user.upsert({
      where: { phone: identifier },
      update: {},
      create: { phone: identifier },
    });
  }

  private normalizeAndValidateIdentifier(
    type: VerificationCodeType,
    identifier: string,
  ): string {
    const normalizedIdentifier = normalizeIdentifier(type, identifier);

    if (!isValidIdentifier(type, normalizedIdentifier)) {
      throw new BadRequestException(
        'identifier must be a valid email or international phone number',
      );
    }

    return normalizedIdentifier;
  }

  async getCodeForDevelopment(
    userId: string,
    type: VerificationCodeType,
  ): Promise<string> {
    if (
      process.env.NODE_ENV ===
      'production'
    ) {
      throw new BadRequestException(
        'Development OTP access is disabled in production',
      );
    }

    const user =
      await this.prisma.user.findUnique({
        where: {
          id: userId,
        },
      });

    if (!user) {
      throw new BadRequestException(
        'User not found',
      );
    }

    const identifier =
      type === VerificationCodeType.EMAIL
        ? user.email
        : user.phone;

    if (!identifier) {
      throw new BadRequestException(
        'User does not have the requested identifier',
      );
    }

    const code =
      this.deliveryService.getDevelopmentCode(
        type,
        identifier,
      );

    if (!code) {
      throw new BadRequestException(
        'No active development verification code found',
      );
    }

    return code;
  }
}
