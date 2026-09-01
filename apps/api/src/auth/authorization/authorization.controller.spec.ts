import { describe, expect, it, beforeEach, vi } from 'vitest';
import { AuthorizationController } from './authorization.controller.js';
import { AuthorizationService } from './authorization.service.js';

describe('AuthorizationController', () => {
  let controller: AuthorizationController;

  const authorizationService = {
    findPermissions: vi.fn(),
    findRoles: vi.fn(),
    findRoleById: vi.fn(),
    createRole: vi.fn(),
    updateRole: vi.fn(),
    deleteRole: vi.fn(),
    assignPermissionToRole: vi.fn(),
    removePermissionFromRole: vi.fn(),
    assignRoleToUser: vi.fn(),
    removeRoleFromUser: vi.fn(),
    findUserRoles: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    controller = new AuthorizationController(
      authorizationService as unknown as AuthorizationService,
    );
  });

  it('lists permissions', async () => {
    const permissions = [
      { id: 'permission-1', key: 'identity:user:read' },
    ];

    authorizationService.findPermissions.mockResolvedValue(permissions);

    await expect(controller.findPermissions()).resolves.toEqual(permissions);
    expect(authorizationService.findPermissions).toHaveBeenCalledOnce();
  });

  it('assigns a permission to a role', async () => {
    const result = {
      roleId: 'role-1',
      permissionId: 'permission-1',
    };

    authorizationService.assignPermissionToRole.mockResolvedValue(result);

    await expect(
      controller.assignPermissionToRole('role-1', 'permission-1'),
    ).resolves.toEqual(result);

    expect(
      authorizationService.assignPermissionToRole,
    ).toHaveBeenCalledWith('role-1', 'permission-1');
  });

  it('removes a permission from a role', async () => {
    authorizationService.removePermissionFromRole.mockResolvedValue({
      roleId: 'role-1',
      permissionId: 'permission-1',
    });

    await controller.removePermissionFromRole(
      'role-1',
      'permission-1',
    );

    expect(
      authorizationService.removePermissionFromRole,
    ).toHaveBeenCalledWith('role-1', 'permission-1');
  });

  it('lists roles', async () => {
    const roles = [{ id: 'role-1', name: 'ADMIN' }];

    authorizationService.findRoles.mockResolvedValue(roles);

    await expect(controller.findRoles()).resolves.toEqual(roles);
  });

  it('gets a role by id', async () => {
    const role = { id: 'role-1', name: 'ADMIN' };

    authorizationService.findRoleById.mockResolvedValue(role);

    await expect(controller.findRoleById('role-1')).resolves.toEqual(role);
    expect(authorizationService.findRoleById).toHaveBeenCalledWith('role-1');
  });

  it('creates a role', async () => {
    const dto = {
      name: 'MANAGER',
      description: 'Manager role',
    };

    authorizationService.createRole.mockResolvedValue({
      id: 'role-2',
      ...dto,
    });

    await controller.createRole(dto);

    expect(authorizationService.createRole).toHaveBeenCalledWith(dto);
  });

  it('updates a role', async () => {
    const dto = {
      description: 'Updated description',
    };

    authorizationService.updateRole.mockResolvedValue({
      id: 'role-1',
      ...dto,
    });

    await controller.updateRole('role-1', dto);

    expect(authorizationService.updateRole).toHaveBeenCalledWith(
      'role-1',
      dto,
    );
  });

  it('deletes a role', async () => {
    authorizationService.deleteRole.mockResolvedValue({
      id: 'role-1',
    });

    await controller.deleteRole('role-1');

    expect(authorizationService.deleteRole).toHaveBeenCalledWith('role-1');
  });

  it('assigns a role to a user', async () => {
    authorizationService.assignRoleToUser.mockResolvedValue({
      userId: 'user-1',
      roleId: 'role-1',
    });

    await controller.assignRoleToUser('user-1', 'role-1');

    expect(authorizationService.assignRoleToUser).toHaveBeenCalledWith(
      'user-1',
      'role-1',
    );
  });

  it('removes a role from a user', async () => {
    authorizationService.removeRoleFromUser.mockResolvedValue({
      userId: 'user-1',
      roleId: 'role-1',
    });

    await controller.removeRoleFromUser('user-1', 'role-1');

    expect(authorizationService.removeRoleFromUser).toHaveBeenCalledWith(
      'user-1',
      'role-1',
    );
  });

  it('lists roles assigned to a user', async () => {
    const roles = [{ id: 'role-1', name: 'ADMIN' }];

    authorizationService.findUserRoles.mockResolvedValue(roles);

    await expect(controller.findUserRoles('user-1')).resolves.toEqual(roles);

    expect(authorizationService.findUserRoles).toHaveBeenCalledWith(
      'user-1',
    );
  });
});
