import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service.js';

interface AccessTokenPayload {
  sub?: unknown;
  sid?: unknown;
  iat?: unknown;
  exp?: unknown;
}

interface AuthenticatedRequest {
  headers: {
    authorization?: string;
  };
  user?: {
    userId: string;
    sessionId: string;
  };
}

@Injectable()
export class LogoutJwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const request =
      context.switchToHttp().getRequest<AuthenticatedRequest>();

    const authorization =
      request.headers.authorization;

    if (
      typeof authorization !== 'string' ||
      !authorization.startsWith('Bearer ')
    ) {
      throw new UnauthorizedException();
    }

    const token = authorization.slice(7).trim();

    if (!token) {
      throw new UnauthorizedException();
    }

    let payload: AccessTokenPayload;

    try {
      payload =
        await this.jwtService.verifyAsync<AccessTokenPayload>(
          token,
        );
    } catch {
      throw new UnauthorizedException();
    }

    if (
      typeof payload.sub !== 'string' ||
      payload.sub.length === 0 ||
      typeof payload.sid !== 'string' ||
      payload.sid.length === 0 ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number'
    ) {
      throw new UnauthorizedException();
    }

    const session =
      await this.prisma.session.findUnique({
        where: {
          id: payload.sid,
        },
        select: {
          id: true,
          userId: true,
          expiresAt: true,
        },
      });

    if (!session) {
      throw new UnauthorizedException();
    }

    if (
      session.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException();
    }

    if (session.userId !== payload.sub) {
      throw new UnauthorizedException();
    }

    request.user = {
      userId: payload.sub,
      sessionId: payload.sid,
    };

    return true;
  }
}
