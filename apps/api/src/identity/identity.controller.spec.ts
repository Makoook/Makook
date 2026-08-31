import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IdentityController } from './identity.controller.js';
import { IdentityService } from './identity.service.js';
import { UserStatus } from '../generated/prisma/enums.js';

describe('IdentityController', () => {
  let controller: IdentityController;

  let identityService: {
    createUser: ReturnType<typeof vi.fn>;
    findUserById: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    identityService = {
      createUser: vi.fn(),
      findUserById: vi.fn(),
    };

    controller = new IdentityController(
      identityService as unknown as IdentityService,
    );
  });

  describe('findUser', () => {
    const userRecord = {
      id: 'user-1',
      phone: null,
      email: 'user-1@makook.local',
      phoneVerifiedAt: null,
      emailVerifiedAt: null,
      status: UserStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      roles: [],
    };

    it('returns the record when the caller requests their own id', async () => {
      identityService.findUserById.mockResolvedValue(userRecord);

      await expect(
        controller.findUser('user-1', {
          user: { userId: 'user-1', sessionId: 'session-1' },
        }),
      ).resolves.toEqual(userRecord);

      expect(identityService.findUserById).toHaveBeenCalledWith('user-1');
    });

    it('rejects a caller requesting a different user id', async () => {
      await expect(
        controller.findUser('user-2', {
          user: { userId: 'user-1', sessionId: 'session-1' },
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(identityService.findUserById).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the caller\'s own record is missing', async () => {
      identityService.findUserById.mockResolvedValue(null);

      await expect(
        controller.findUser('user-1', {
          user: { userId: 'user-1', sessionId: 'session-1' },
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
