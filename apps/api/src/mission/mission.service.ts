import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MissionStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthorizationService } from '../auth/authorization/authorization.service.js';
import { PERMISSIONS } from '../auth/authorization/permission.constants.js';

@Injectable()
export class MissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async create(customerId: string) {
    return this.prisma.mission.create({
      data: {
        customerId,
        status: MissionStatus.DRAFT,
      },
    });
  }

  async listForCustomer(customerId: string) {
    return this.prisma.mission.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(
    missionId: string,
    userId: string,
  ) {
    const mission = await this.requireMission(missionId);

    if (
      mission.customerId !== userId &&
      mission.runnerId !== userId &&
      !(await this.authorizationService.userHasPermission(
        userId,
        PERMISSIONS.MISSION_READ_ANY,
      ))
    ) {
      throw new ForbiddenException(
        'You cannot access this mission',
      );
    }

    return mission;
  }

  async publish(
    missionId: string,
    customerId: string,
  ) {
    const mission = await this.requireOwnedMission(
      missionId,
      customerId,
    );

    this.requireStatus(
      mission.status,
      MissionStatus.DRAFT,
    );

    return this.prisma.mission.update({
      where: { id: missionId },
      data: { status: MissionStatus.OPEN },
    });
  }

  async listAvailable() {
    return this.prisma.mission.findMany({
      where: {
        status: MissionStatus.OPEN,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async accept(
    missionId: string,
    runnerId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.mission.updateMany({
        where: {
          id: missionId,
          status: MissionStatus.OPEN,
          runnerId: null,
        },
        data: {
          runnerId,
          status: MissionStatus.ACCEPTED,
        },
      });

      if (result.count !== 1) {
        const mission =
          await tx.mission.findUnique({
            where: { id: missionId },
          });

        if (!mission) {
          throw new NotFoundException(
            'Mission not found',
          );
        }

        throw new ConflictException(
          'Mission is no longer available',
        );
      }

      return tx.mission.findUniqueOrThrow({
        where: { id: missionId },
      });
    });
  }

  async start(
    missionId: string,
    runnerId: string,
  ) {
    const mission = await this.requireMission(
      missionId,
    );

    if (mission.runnerId !== runnerId) {
      throw new ForbiddenException(
        'You are not the assigned runner',
      );
    }

    this.requireStatus(
      mission.status,
      MissionStatus.ACCEPTED,
    );

    return this.prisma.mission.update({
      where: { id: missionId },
      data: {
        status: MissionStatus.IN_PROGRESS,
      },
    });
  }

  async complete(
    missionId: string,
    runnerId: string,
  ) {
    const mission = await this.requireMission(
      missionId,
    );

    if (mission.runnerId !== runnerId) {
      throw new ForbiddenException(
        'You are not the assigned runner',
      );
    }

    this.requireStatus(
      mission.status,
      MissionStatus.IN_PROGRESS,
    );

    return this.prisma.mission.update({
      where: { id: missionId },
      data: {
        status: MissionStatus.COMPLETED,
      },
    });
  }

  async cancel(
    missionId: string,
    customerId: string,
  ) {
    const mission = await this.requireOwnedMission(
      missionId,
      customerId,
    );

    if (
      mission.status === MissionStatus.COMPLETED ||
      mission.status === MissionStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Mission cannot be cancelled',
      );
    }

    return this.prisma.mission.update({
      where: { id: missionId },
      data: {
        status: MissionStatus.CANCELLED,
      },
    });
  }

  async reassign(
    missionId: string,
    runnerId: string,
  ) {
    const mission = await this.requireMission(
      missionId,
    );

    if (
      mission.status === MissionStatus.COMPLETED ||
      mission.status === MissionStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Mission cannot be reassigned',
      );
    }

    const runner =
      await this.prisma.user.findUnique({
        where: { id: runnerId },
        include: {
          roles: {
            include: {
              role: true,
            },
          },
        },
      });

    if (!runner || runner.status === 'DELETED') {
      throw new NotFoundException(
        'Runner not found',
      );
    }

    const isRunner =
      runner.roles.some(
        ({ role }) =>
          role.name === 'RUNNER',
      );

    if (!isRunner) {
      throw new BadRequestException(
        'Target user is not a runner',
      );
    }

    return this.prisma.mission.update({
      where: { id: missionId },
      data: {
        runnerId,
        status: MissionStatus.ACCEPTED,
      },
    });
  }

  private async requireMission(
    missionId: string,
  ) {
    const mission =
      await this.prisma.mission.findUnique({
        where: { id: missionId },
      });

    if (!mission) {
      throw new NotFoundException(
        'Mission not found',
      );
    }

    return mission;
  }

  private async requireOwnedMission(
    missionId: string,
    customerId: string,
  ) {
    const mission =
      await this.requireMission(missionId);

    if (mission.customerId !== customerId) {
      throw new ForbiddenException(
        'You do not own this mission',
      );
    }

    return mission;
  }

  private requireStatus(
    actual: MissionStatus,
    expected: MissionStatus,
  ) {
    if (actual !== expected) {
      throw new BadRequestException(
        `Invalid mission state: expected ${expected}`,
      );
    }
  }
}
