import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IdentityController } from './identity.controller.js';
import { IdentityService } from './identity.service.js';
import { UserStatus } from '../generated/prisma/enums.js';
import { AuthorizationService } from '../auth/authorization/authorization.service.js';

describe('IdentityController', () => {
  let controller: IdentityController;

  let identityService: {
    createUser: ReturnType<typeof vi.fn>;
    findUserById: ReturnType<typeof vi.fn>;
    updateUser: ReturnType<typeof vi.fn>;
    deleteUser: ReturnType<typeof vi.fn>;
  };

  let authorizationService: {
    userHasPermission: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    identityService = {
      createUser: vi.fn(),
      findUserById: vi.fn(),
      updateUser: vi.fn(),
      deleteUser: vi.fn(),
    };

    authorizationService = {
      userHasPermission: vi.fn(),
    };

    controller = new IdentityController(
      identityService as unknown as IdentityService,
      authorizationService as unknown as AuthorizationService,
    );
  });


  describe('updateUser', () => {
    const updatedRecord = {
      id: 'user-1',
      phone: '+201001234567',
      email: 'updated@makook.local',
      phoneVerifiedAt: null,
      emailVerifiedAt: null,
      status: UserStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      roles: [],
    };

    it('updates the caller own record without requiring permission', async () => {
      identityService.updateUser.mockResolvedValue(
        updatedRecord,
      );

      await expect(
        controller.updateUser(
          'user-1',
          {
            email: 'updated@makook.local',
          },
          {
            user: {
              userId: 'user-1',
              sessionId: 'session-1',
            },
          },
        ),
      ).resolves.toEqual(updatedRecord);

      expect(
        identityService.updateUser,
      ).toHaveBeenCalledWith(
        'user-1',
        {
          email: 'updated@makook.local',
        },
      );

      expect(
        authorizationService.userHasPermission,
      ).not.toHaveBeenCalled();
    });

    it('allows updating another user with update permission', async () => {
      identityService.updateUser.mockResolvedValue(
        {
          ...updatedRecord,
          id: 'user-2',
        },
      );

      authorizationService.userHasPermission.mockResolvedValue(
        true,
      );

      await expect(
        controller.updateUser(
          'user-2',
          {
            email: 'updated@makook.local',
          },
          {
            user: {
              userId: 'user-1',
              sessionId: 'session-1',
            },
          },
        ),
      ).resolves.toEqual({
        ...updatedRecord,
        id: 'user-2',
      });

      expect(
        authorizationService.userHasPermission,
      ).toHaveBeenCalledWith(
        'user-1',
        'identity:user:update',
      );

      expect(
        identityService.updateUser,
      ).toHaveBeenCalledWith(
        'user-2',
        {
          email: 'updated@makook.local',
        },
      );
    });

    it('rejects updating another user without update permission', async () => {
      identityService.updateUser = vi.fn();

      authorizationService.userHasPermission.mockResolvedValue(
        false,
      );

      await expect(
        controller.updateUser(
          'user-2',
          {
            email: 'updated@makook.local',
          },
          {
            user: {
              userId: 'user-1',
              sessionId: 'session-1',
            },
          },
        ),
      ).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      expect(
        authorizationService.userHasPermission,
      ).toHaveBeenCalledWith(
        'user-1',
        'identity:user:update',
      );

      expect(
        identityService.updateUser,
      ).not.toHaveBeenCalled();
    });
  });

  describe('deleteUser', () => {
    const deletedRecord = {
      id: 'user-1',
      phone: '+201001234567',
      email: 'deleted@makook.local',
      phoneVerifiedAt: null,
      emailVerifiedAt: null,
      status: UserStatus.DELETED,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: new Date(),
      roles: [],
    };

    it('allows a user to delete their own record', async () => {
      identityService.deleteUser = vi.fn();
      identityService.deleteUser.mockResolvedValue(
        deletedRecord,
      );

      await expect(
        controller.deleteUser(
          'user-1',
          {
            user: {
              userId: 'user-1',
              sessionId: 'session-1',
            },
          },
        ),
      ).resolves.toEqual(deletedRecord);

      expect(
        identityService.deleteUser,
      ).toHaveBeenCalledWith('user-1');

      expect(
        authorizationService.userHasPermission,
      ).not.toHaveBeenCalled();
    });

    it('allows deleting another user with delete permission', async () => {
      identityService.deleteUser = vi.fn();
      identityService.deleteUser.mockResolvedValue({
        ...deletedRecord,
        id: 'user-2',
      });

      authorizationService.userHasPermission.mockResolvedValue(
        true,
      );

      await expect(
        controller.deleteUser(
          'user-2',
          {
            user: {
              userId: 'user-1',
              sessionId: 'session-1',
            },
          },
        ),
      ).resolves.toEqual({
        ...deletedRecord,
        id: 'user-2',
      });

      expect(
        authorizationService.userHasPermission,
      ).toHaveBeenCalledWith(
        'user-1',
        'identity:user:delete',
      );

      expect(
        identityService.deleteUser,
      ).toHaveBeenCalledWith('user-2');
    });

    it('rejects deleting another user without delete permission', async () => {
      identityService.deleteUser = vi.fn();

      authorizationService.userHasPermission.mockResolvedValue(
        false,
      );

      await expect(
        controller.deleteUser(
          'user-2',
          {
            user: {
              userId: 'user-1',
              sessionId: 'session-1',
            },
          },
        ),
      ).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      expect(
        authorizationService.userHasPermission,
      ).toHaveBeenCalledWith(
        'user-1',
        'identity:user:delete',
      );

      expect(
        identityService.deleteUser,
      ).not.toHaveBeenCalled();
    });
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

    it('returns the caller own record without requiring a permission', async () => {
      identityService.findUserById.mockResolvedValue(userRecord);

      await expect(
        controller.findUser('user-1', {
          user: {
            userId: 'user-1',
            sessionId: 'session-1',
          },
        }),
      ).resolves.toEqual(userRecord);

      expect(
        identityService.findUserById,
      ).toHaveBeenCalledWith('user-1');

      expect(
        authorizationService.userHasPermission,
      ).not.toHaveBeenCalled();
    });

    it('allows reading another user when the caller has the read permission', async () => {
      authorizationService.userHasPermission.mockResolvedValue(true);
      identityService.findUserById.mockResolvedValue({
        ...userRecord,
        id: 'user-2',
      });

      await expect(
        controller.findUser('user-2', {
          user: {
            userId: 'user-1',
            sessionId: 'session-1',
          },
        }),
      ).resolves.toEqual({
        ...userRecord,
        id: 'user-2',
      });

      expect(
        authorizationService.userHasPermission,
      ).toHaveBeenCalledWith(
        'user-1',
        'identity:user:read',
      );

      expect(
        identityService.findUserById,
      ).toHaveBeenCalledWith('user-2');
    });

    it('rejects reading another user without the read permission', async () => {
      authorizationService.userHasPermission.mockResolvedValue(false);

      await expect(
        controller.findUser('user-2', {
          user: {
            userId: 'user-1',
            sessionId: 'session-1',
          },
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(
        identityService.findUserById,
      ).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the caller own record is missing', async () => {
      identityService.findUserById.mockResolvedValue(null);

      await expect(
        controller.findUser('user-1', {
          user: {
            userId: 'user-1',
            sessionId: 'session-1',
          },
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
