import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { PermissionGuard } from './permission.guard.js';
import { REQUIRED_PERMISSION_KEY } from './permission.decorator.js';
import { PERMISSIONS } from './permission.constants.js';
import { AuthorizationService } from './authorization.service.js';

describe('PermissionGuard', () => {
  let guard: PermissionGuard;

  let reflector: {
    getAllAndOverride: ReturnType<typeof vi.fn>;
  };

  let authorizationService: {
    userHasPermission: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    reflector = {
      getAllAndOverride: vi.fn(),
    };

    authorizationService = {
      userHasPermission: vi.fn(),
    };

    guard = new PermissionGuard(
      reflector as unknown as Reflector,
      authorizationService as unknown as AuthorizationService,
    );
  });

  function createContext(
    user?: {
      userId: string;
      sessionId: string;
    },
  ) {
    const request: {
      user?: {
        userId: string;
        sessionId: string;
      };
    } = {};

    if (user) {
      request.user = user;
    }

    const httpContext = {
      getRequest: () => request,
    };

    const handler = vi.fn();
    const controller = vi.fn();

    const context = {
      getHandler: () => handler,
      getClass: () => controller,
      switchToHttp: () => httpContext,
    } as unknown as ExecutionContext;

    return {
      context,
      request,
      handler,
      controller,
    };
  }

  it('allows a user who has the required permission', async () => {
    reflector.getAllAndOverride.mockReturnValue(
      PERMISSIONS.IDENTITY_USER_READ,
    );

    authorizationService.userHasPermission.mockResolvedValue(
      true,
    );

    const { context } = createContext({
      userId: 'user-1',
      sessionId: 'session-1',
    });

    await expect(
      guard.canActivate(context),
    ).resolves.toBe(true);

    expect(
      reflector.getAllAndOverride,
    ).toHaveBeenCalledWith(
      REQUIRED_PERMISSION_KEY,
      expect.any(Array),
    );

    expect(
      authorizationService.userHasPermission,
    ).toHaveBeenCalledWith(
      'user-1',
      PERMISSIONS.IDENTITY_USER_READ,
    );
  });

  it('rejects a user who does not have the required permission', async () => {
    reflector.getAllAndOverride.mockReturnValue(
      PERMISSIONS.IDENTITY_USER_READ,
    );

    authorizationService.userHasPermission.mockResolvedValue(
      false,
    );

    const { context } = createContext({
      userId: 'user-1',
      sessionId: 'session-1',
    });

    await expect(
      guard.canActivate(context),
    ).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(
      authorizationService.userHasPermission,
    ).toHaveBeenCalledWith(
      'user-1',
      PERMISSIONS.IDENTITY_USER_READ,
    );
  });

  it('rejects an unauthenticated request', async () => {
    reflector.getAllAndOverride.mockReturnValue(
      PERMISSIONS.IDENTITY_USER_READ,
    );

    const { context } = createContext();

    await expect(
      guard.canActivate(context),
    ).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(
      authorizationService.userHasPermission,
    ).not.toHaveBeenCalled();
  });

  it('allows an endpoint without permission metadata', async () => {
    reflector.getAllAndOverride.mockReturnValue(
      undefined,
    );

    const { context } = createContext();

    await expect(
      guard.canActivate(context),
    ).resolves.toBe(true);

    expect(
      authorizationService.userHasPermission,
    ).not.toHaveBeenCalled();
  });
});
