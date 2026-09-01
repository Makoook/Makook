import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
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

  async updateUser(
    id: string,
    dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    const existingUser =
      await this.prisma.user.findUnique({
        where: { id },
      });

    if (!existingUser) {
      throw new NotFoundException(
        'User not found',
      );
    }

    const phone = dto.phone
      ? normalizePhone(dto.phone)
      : undefined;

    const email = dto.email
      ? normalizeEmail(dto.email)
      : undefined;

    if (
      (phone &&
        !isValidIdentifier(
          VerificationCodeType.PHONE,
          phone,
        )) ||
      (email &&
        !isValidIdentifier(
          VerificationCodeType.EMAIL,
          email,
        ))
    ) {
      throw new BadRequestException(
        'phone and email must be valid normalized identifiers',
      );
    }

    if (phone && phone !== existingUser.phone) {
      const existingPhone =
        await this.prisma.user.findUnique({
          where: { phone },
        });

      if (
        existingPhone &&
        existingPhone.id !== id
      ) {
        throw new ConflictException(
          'phone is already registered',
        );
      }
    }

    if (email && email !== existingUser.email) {
      const existingEmail =
        await this.prisma.user.findUnique({
          where: { email },
        });

      if (
        existingEmail &&
        existingEmail.id !== id
      ) {
        throw new ConflictException(
          'email is already registered',
        );
      }
    }

    const user =
      await this.prisma.user.update({
        where: { id },
        data: {
          ...(phone !== undefined
            ? {
                phone,
                ...(phone !== existingUser.phone
                  ? { phoneVerifiedAt: null }
                  : {}),
              }
            : {}),
          ...(email !== undefined
            ? {
                email,
                ...(email !== existingUser.email
                  ? { emailVerifiedAt: null }
                  : {}),
              }
            : {}),
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
      phoneVerifiedAt:
        user.phoneVerifiedAt,
      emailVerifiedAt:
        user.emailVerifiedAt,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      deletedAt: user.deletedAt,
      roles: user.roles.map(
        ({ role }) => ({
          id: role.id,
          name: role.name,
          description: role.description,
        }),
      ),
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

  async deleteUser(id: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.status === 'DELETED') {
      return this.findUserById(id) as Promise<UserResponseDto>;
    }

    const deletedUser = await this.prisma.$transaction(
      async (tx) => {
        const updatedUser = await tx.user.update({
          where: { id },
          data: {
            status: 'DELETED',
            deletedAt: new Date(),
          },
          include: {
            roles: {
              include: {
                role: true,
              },
            },
          },
        });

        await tx.session.updateMany({
          where: {
            userId: id,
            revokedAt: null,
          },
          data: {
            revokedAt: new Date(),
          },
        });

        return updatedUser;
      },
    );

    return {
      id: deletedUser.id,
      phone: deletedUser.phone,
      email: deletedUser.email,
      phoneVerifiedAt: deletedUser.phoneVerifiedAt,
      emailVerifiedAt: deletedUser.emailVerifiedAt,
      status: deletedUser.status,
      createdAt: deletedUser.createdAt,
      updatedAt: deletedUser.updatedAt,
      deletedAt: deletedUser.deletedAt,
      roles: deletedUser.roles.map(({ role }) => ({
        id: role.id,
        name: role.name,
        description: role.description,
      })),
    };
  }

}
