import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { MissionStatus } from '../generated/prisma/enums.js';
import { MissionService } from './mission.service.js';

describe('MissionService', () => {
  const mission = {
    id: 'mission-1',
    customerId: 'customer-1',
    runnerId: null,
    status: MissionStatus.DRAFT,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const prisma = {
    mission: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  const authorizationService = {
    userHasPermission: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a draft mission for the customer', async () => {
    prisma.mission.create.mockResolvedValue(mission);

    const service = new MissionService(
      prisma as any,
      authorizationService as any,
    );

    await expect(
      service.create('customer-1'),
    ).resolves.toEqual(mission);

    expect(prisma.mission.create).toHaveBeenCalledWith({
      data: {
        customerId: 'customer-1',
        status: MissionStatus.DRAFT,
      },
    });
  });

  it('rejects publishing a non-draft mission', async () => {
    prisma.mission.findUnique.mockResolvedValue({
      ...mission,
      status: MissionStatus.OPEN,
    });

    const service = new MissionService(
      prisma as any,
      authorizationService as any,
    );

    await expect(
      service.publish(
        'mission-1',
        'customer-1',
      ),
    ).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a failed concurrent mission acceptance', async () => {
    prisma.$transaction.mockImplementation(
      async (callback: any) =>
        callback({
          mission: {
            updateMany: vi.fn().mockResolvedValue({
              count: 0,
            }),
            findUnique: vi.fn().mockResolvedValue({
              ...mission,
              status: MissionStatus.ACCEPTED,
              runnerId: 'runner-1',
            }),
          },
        }),
    );

    const service = new MissionService(
      prisma as any,
      authorizationService as any,
    );

    await expect(
      service.accept(
        'mission-1',
        'runner-2',
      ),
    ).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
