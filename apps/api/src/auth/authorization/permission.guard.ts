import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  AuthenticatedPrincipal,
} from '../guards/jwt-auth.guard.js';
import {
  REQUIRED_PERMISSION_KEY,
} from './permission.decorator.js';
import { AuthorizationService } from './authorization.service.js';

interface AuthenticatedRequest {
  user?: AuthenticatedPrincipal;
}

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const permission =
      this.reflector.getAllAndOverride<string>(
        REQUIRED_PERMISSION_KEY,
        [
          context.getHandler(),
          context.getClass(),
        ],
      );

    if (!permission) {
      return true;
    }

    const request =
      context
        .switchToHttp()
        .getRequest<AuthenticatedRequest>();

    const principal = request.user;

    if (!principal) {
      throw new UnauthorizedException();
    }

    const allowed =
      await this.authorizationService.userHasPermission(
        principal.userId,
        permission as Parameters<
          AuthorizationService['userHasPermission']
        >[1],
      );

    if (!allowed) {
      throw new ForbiddenException(
        'Insufficient permissions',
      );
    }

    return true;
  }
}
