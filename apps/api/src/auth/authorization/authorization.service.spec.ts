import {
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AuthorizationService } from './authorization.service.js';

describe('AuthorizationService', () => {
  let service: AuthorizationService;

  const prisma = {
    user: {
      findUnique: vi.fn(),
    },
    role: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    permission: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    userRole: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    rolePermission: {
      upsert: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    service = new AuthorizationService(
      prisma as any,
    );
  });

  describe('assignRoleToUser', () => {
    it('assigns an existing role to an existing user', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
      });

      prisma.role.findUnique.mockResolvedValue({
        id: 'role-1',
      });

      prisma.userRole.upsert.mockResolvedValue({
        userId: 'user-1',
        roleId: 'role-1',
      });

      await expect(
        service.assignRoleToUser(
          'user-1',
          'role-1',
        ),
      ).resolves.toEqual({
        userId: 'user-1',
        roleId: 'role-1',
      });

      expect(prisma.userRole.upsert).toHaveBeenCalled();
    });

    it('rejects when user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.role.findUnique.mockResolvedValue({
        id: 'role-1',
      });

      await expect(
        service.assignRoleToUser(
          'missing-user',
          'role-1',
        ),
      ).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects when role does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
      });

      prisma.role.findUnique.mockResolvedValue(null);

      await expect(
        service.assignRoleToUser(
          'user-1',
          'missing-role',
        ),
      ).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('findUserRoles', () => {
    it('returns user role assignments', async () => {
      const roles = [
        {
          userId: 'user-1',
          roleId: 'role-1',
          role: {
            id: 'role-1',
            name: 'ADMIN',
          },
        },
      ];

      prisma.userRole.findMany.mockResolvedValue(
        roles,
      );

      await expect(
        service.findUserRoles('user-1'),
      ).resolves.toEqual(roles);

      expect(
        prisma.userRole.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user-1',
          },
        }),
      );
    });
  });

  describe('findPermissions', () => {
    it('returns permissions ordered by key', async () => {
      const permissions = [
        {
          id: 'permission-1',
          key: 'identity:user:read',
        },
      ];

      prisma.permission.findMany.mockResolvedValue(
        permissions,
      );

      await expect(
        service.findPermissions(),
      ).resolves.toEqual(permissions);

      expect(
        prisma.permission.findMany,
      ).toHaveBeenCalledWith({
        orderBy: {
          key: 'asc',
        },
      });
    });
  });

  describe('assignPermissionToRole', () => {
    it('assigns an existing permission to an existing role', async () => {
      prisma.role.findUnique.mockResolvedValue({
        id: 'role-1',
      });

      prisma.permission.findUnique.mockResolvedValue({
        id: 'permission-1',
      });

      prisma.rolePermission.upsert.mockResolvedValue({
        roleId: 'role-1',
        permissionId: 'permission-1',
      });

      await expect(
        service.assignPermissionToRole(
          'role-1',
          'permission-1',
        ),
      ).resolves.toEqual({
        roleId: 'role-1',
        permissionId: 'permission-1',
      });
    });

    it('rejects missing role', async () => {
      prisma.role.findUnique.mockResolvedValue(null);

      prisma.permission.findUnique.mockResolvedValue({
        id: 'permission-1',
      });

      await expect(
        service.assignPermissionToRole(
          'missing-role',
          'permission-1',
        ),
      ).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects missing permission', async () => {
      prisma.role.findUnique.mockResolvedValue({
        id: 'role-1',
      });

      prisma.permission.findUnique.mockResolvedValue(null);

      await expect(
        service.assignPermissionToRole(
          'role-1',
          'missing-permission',
        ),
      ).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('createRole', () => {
    it('rejects duplicate role names', async () => {
      prisma.role.findUnique.mockResolvedValue({
        id: 'existing-role',
        name: 'ADMIN',
      });

      await expect(
        service.createRole({
          name: 'ADMIN',
        }),
      ).rejects.toBeInstanceOf(
        ConflictException,
      );

      expect(prisma.role.create).not.toHaveBeenCalled();
    });

    it('creates a new role', async () => {
      prisma.role.findUnique.mockResolvedValue(null);

      prisma.role.create.mockResolvedValue({
        id: 'role-2',
        name: 'MANAGER',
        description: 'Manager role',
      });

      await expect(
        service.createRole({
          name: 'MANAGER',
          description: 'Manager role',
        }),
      ).resolves.toEqual({
        id: 'role-2',
        name: 'MANAGER',
        description: 'Manager role',
      });
    });
  });

  describe('findRoleById', () => {
    it('returns an existing role', async () => {
      const role = {
        id: 'role-1',
        name: 'ADMIN',
        permissions: [],
      };

      prisma.role.findUnique.mockResolvedValue(role);

      await expect(
        service.findRoleById('role-1'),
      ).resolves.toEqual(role);
    });

    it('throws when role does not exist', async () => {
      prisma.role.findUnique.mockResolvedValue(null);

      await expect(
        service.findRoleById('missing-role'),
      ).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('userHasPermission', () => {
    it('returns true when permission exists through a role', async () => {
      prisma.userRole.findFirst.mockResolvedValue({
        userId: 'user-1',
        roleId: 'role-1',
      });

      await expect(
        service.userHasPermission(
          'user-1',
          'identity:user:read' as any,
        ),
      ).resolves.toBe(true);
    });

    it('returns false when permission does not exist', async () => {
      prisma.userRole.findFirst.mockResolvedValue(null);

      await expect(
        service.userHasPermission(
          'user-1',
          'identity:user:delete' as any,
        ),
      ).resolves.toBe(false);
    });
  });
});
