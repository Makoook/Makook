import { Throttle } from '@nestjs/throttler';
﻿import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { LogoutJwtAuthGuard } from './guards/logout-jwt-auth.guard.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import {
  AuthenticatedPrincipal,
  JwtAuthGuard,
} from './guards/jwt-auth.guard.js';

interface AuthenticatedRequest {
  user: AuthenticatedPrincipal;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
  ) {}

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('refresh')
  async refresh(
    @Body() dto: RefreshTokenDto,
  ): Promise<{
    sessionId: string;
    refreshToken: string;
    accessToken: string;
  }> {
    return this.authService.rotateRefreshToken(
      dto.sessionId,
      dto.refreshToken,
    );
  }

  /**
   * Revokes the session tied to the caller's own access
   * token.
   *
   * The session to revoke comes from the verified JWT
   * (`request.user.sessionId`), never from the request
   * body â€” that way there is no id to check ownership of,
   * and this endpoint cannot be used to revoke someone
   * else's session.
   */
  @UseGuards(LogoutJwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.authService.revokeSession(
      request.user.sessionId,
    );
  }
}




