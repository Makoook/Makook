import {
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  AuthenticatedPrincipal,
  JwtAuthGuard,
} from './jwt-auth.guard.js';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let jwtService: {
    verifyAsync: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    jwtService = {
      verifyAsync: vi.fn(),
    };

    guard = new JwtAuthGuard(
      jwtService as unknown as JwtService,
    );
  });

  function createContext(
    authorization?: string,
  ) {
    const request: {
      headers: {
        authorization?: string;
      };
      user?: AuthenticatedPrincipal;
    } = {
      headers: {},
    };

    if (authorization !== undefined) {
      request.headers.authorization =
        authorization;
    }

    const httpContext = {
      getRequest: () => request,
    };

    return {
      request,
      context: {
        switchToHttp: () => httpContext,
      } as unknown as ExecutionContext,
    };
  }

  it('accepts a valid Bearer token', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-id',
      sid: 'session-id',
      iat: 100,
      exp: 200,
    });

    const { context, request } = createContext(
      'Bearer valid-access-token',
    );

    await expect(
      guard.canActivate(context),
    ).resolves.toBe(true);

    expect(
      jwtService.verifyAsync,
    ).toHaveBeenCalledWith(
      'valid-access-token',
    );

    expect(request.user).toEqual({
      userId: 'user-id',
      sessionId: 'session-id',
    });
  });

  it('rejects a missing Authorization header', async () => {
    const { context } = createContext();

    await expect(
      guard.canActivate(context),
    ).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(
      jwtService.verifyAsync,
    ).not.toHaveBeenCalled();
  });

  it('rejects a non-Bearer Authorization header', async () => {
    const { context } = createContext(
      'Basic abc123',
    );

    await expect(
      guard.canActivate(context),
    ).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(
      jwtService.verifyAsync,
    ).not.toHaveBeenCalled();
  });

  it('rejects an empty Bearer token', async () => {
    const { context } = createContext(
      'Bearer   ',
    );

    await expect(
      guard.canActivate(context),
    ).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(
      jwtService.verifyAsync,
    ).not.toHaveBeenCalled();
  });

  it('rejects an invalid JWT', async () => {
    jwtService.verifyAsync.mockRejectedValue(
      new Error('invalid signature'),
    );

    const { context } = createContext(
      'Bearer invalid-token',
    );

    await expect(
      guard.canActivate(context),
    ).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an expired JWT', async () => {
    jwtService.verifyAsync.mockRejectedValue(
      new Error('jwt expired'),
    );

    const { context } = createContext(
      'Bearer expired-token',
    );

    await expect(
      guard.canActivate(context),
    ).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a token without sub', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sid: 'session-id',
      iat: 100,
      exp: 200,
    });

    const { context } = createContext(
      'Bearer token-without-sub',
    );

    await expect(
      guard.canActivate(context),
    ).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a token without sid', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-id',
      iat: 100,
      exp: 200,
    });

    const { context } = createContext(
      'Bearer token-without-sid',
    );

    await expect(
      guard.canActivate(context),
    ).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a token without iat', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-id',
      sid: 'session-id',
      exp: 200,
    });

    const { context } = createContext(
      'Bearer token-without-iat',
    );

    await expect(
      guard.canActivate(context),
    ).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a token without exp', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-id',
      sid: 'session-id',
      iat: 100,
    });

    const { context } = createContext(
      'Bearer token-without-exp',
    );

    await expect(
      guard.canActivate(context),
    ).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a token with non-string sub', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 123,
      sid: 'session-id',
      iat: 100,
      exp: 200,
    });

    const { context } = createContext(
      'Bearer invalid-sub',
    );

    await expect(
      guard.canActivate(context),
    ).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a token with non-string sid', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-id',
      sid: 123,
      iat: 100,
      exp: 200,
    });

    const { context } = createContext(
      'Bearer invalid-sid',
    );

    await expect(
      guard.canActivate(context),
    ).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a token with invalid iat type', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-id',
      sid: 'session-id',
      iat: '100',
      exp: 200,
    });

    const { context } = createContext(
      'Bearer invalid-iat',
    );

    await expect(
      guard.canActivate(context),
    ).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a token with invalid exp type', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-id',
      sid: 'session-id',
      iat: 100,
      exp: '200',
    });

    const { context } = createContext(
      'Bearer invalid-exp',
    );

    await expect(
      guard.canActivate(context),
    ).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});