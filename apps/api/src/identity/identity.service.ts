import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import {
  isValidIdentifier,
  normalizeEmail,
  normalizePhone,
} from './identifier-normalizer.js';
import { UserResponseDto } from './dto/user-response.dto.js';
import { VerificationCodeType } from '../generated/prisma/enums.js';

@Injectable()
export class IdentityService {
  constructor(private readonly prisma: PrismaService) {}

  async findUserById(id: string): Promise<UserResponseDto | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      phoneVerifiedAt: user.phoneVerifiedAt,
      emailVerifiedAt: user.emailVerifiedAt,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      deletedAt: user.deletedAt,
      roles: user.roles.map(({ role }) => ({
        id: role.id,
        name: role.name,
        description: role.description,
      })),
    };
  }

  async createUser(dto: CreateUserDto): Promise<UserResponseDto> {
    const phone = dto.phone ? normalizePhone(dto.phone) : undefined;
    const email = dto.email ? normalizeEmail(dto.email) : undefined;

    if (
      (phone && !isValidIdentifier(VerificationCodeType.PHONE, phone)) ||
      (email && !isValidIdentifier(VerificationCodeType.EMAIL, email))
    ) {
      throw new BadRequestException(
        'phone and email must be valid normalized identifiers',
      );
    }

    if (!phone && !email) {
      throw new ConflictException('phone or email is required');
    }

    if (phone) {
      const existingPhone = await this.prisma.user.findUnique({
        where: { phone },
      });

      if (existingPhone) {
        throw new ConflictException('phone is already registered');
      }
    }

    if (email) {
      const existingEmail = await this.prisma.user.findUnique({
        where: { email },
      });

      if (existingEmail) {
        throw new ConflictException('email is already registered');
      }
    }

    const user = await this.prisma.user.create({
      data: {
        phone,
        email,
      },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    });

    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      phoneVerifiedAt: user.phoneVerifiedAt,
      emailVerifiedAt: user.emailVerifiedAt,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      deletedAt: user.deletedAt,
      roles: user.roles.map(({ role }) => ({
        id: role.id,
        name: role.name,
        description: role.description,
      })),
    };
  }
}
