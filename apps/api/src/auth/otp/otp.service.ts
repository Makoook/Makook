import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  createHash,
  randomInt,
} from 'node:crypto';
import {
  PrismaService,
} from '../../prisma/prisma.service.js';
import {
  VerificationCodeType,
} from '../../generated/prisma/enums.js';

@Injectable()
export class OtpService {
  private readonly codeLifetimeMs =
    5 * 60 * 1000;

  private readonly maximumAttempts = 5;

  constructor(
    private readonly prisma: PrismaService,
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

  async createCode(
    userId: string,
    type: VerificationCodeType,
  ): Promise<string> {
    await this.prisma.verificationCode.updateMany({
      where: {
        userId,
        type,
        usedAt: null,
      },
      data: {
        usedAt: new Date(),
      },
    });

    const code =
      this.generateCode();

    const codeHash =
      this.hashCode(code);

    const expiresAt =
      new Date(
        Date.now() +
          this.codeLifetimeMs,
      );

    await this.prisma.verificationCode.create({
      data: {
        userId,
        type,
        codeHash,
        expiresAt,
      },
    });

    return code;
  }

  async verifyCode(
    userId: string,
    type: VerificationCodeType,
    code: string,
  ): Promise<void> {
    const verificationCode =
      await this.prisma.verificationCode.findFirst({
        where: {
          userId,
          type,
          usedAt: null,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

    if (!verificationCode) {
      throw new UnauthorizedException(
        'Invalid verification code',
      );
    }

    if (
      verificationCode.expiresAt <=
      new Date()
    ) {
      throw new UnauthorizedException(
        'Verification code has expired',
      );
    }

    if (
      verificationCode.attempts >=
      this.maximumAttempts
    ) {
      throw new BadRequestException(
        'Too many verification attempts',
      );
    }

    const codeHash =
      this.hashCode(code);

    if (
      codeHash !==
      verificationCode.codeHash
    ) {
      await this.prisma.verificationCode.update({
        where: {
          id: verificationCode.id,
        },
        data: {
          attempts: {
            increment: 1,
          },
        },
      });

      throw new UnauthorizedException(
        'Invalid verification code',
      );
    }

    await this.prisma.$transaction(
      async (tx) => {
        await tx.verificationCode.update({
          where: {
            id: verificationCode.id,
          },
          data: {
            usedAt: new Date(),
          },
        });

        if (
          type ===
          VerificationCodeType.EMAIL
        ) {
          await tx.user.update({
            where: {
              id: userId,
            },
            data: {
              emailVerifiedAt:
                new Date(),
            },
          });
        }

        if (
          type ===
          VerificationCodeType.PHONE
        ) {
          await tx.user.update({
            where: {
              id: userId,
            },
            data: {
              phoneVerifiedAt:
                new Date(),
            },
          });
        }
      },
    );
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

    const verificationCode =
      await this.prisma.verificationCode.findFirst({
        where: {
          userId,
          type,
          usedAt: null,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

    if (!verificationCode) {
      throw new BadRequestException(
        'No active verification code found',
      );
    }

    if (
      verificationCode.expiresAt <=
      new Date()
    ) {
      throw new BadRequestException(
        'Verification code has expired',
      );
    }

    throw new BadRequestException(
      'The OTP is intentionally not recoverable because only its hash is stored',
    );
  }
}