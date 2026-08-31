import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto.js';
import { IdentityService } from './identity.service.js';
import {
  AuthenticatedPrincipal,
  JwtAuthGuard,
} from '../auth/guards/jwt-auth.guard.js';

interface AuthenticatedRequest {
  user: AuthenticatedPrincipal;
}

@Controller('identity')
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  @Post('users')
  async createUser(@Body() dto: CreateUserDto) {
    return this.identityService.createUser(dto);
  }

  /**
   * A caller may only read their own record.
   *
   * There is no admin/role check here yet because
   * access-token payloads do not currently carry role
   * information (see auth/guards/jwt-auth.guard.ts).
   * Admin access to other users' records should be added
   * as its own guard once roles are wired into the token,
   * not by relaxing this check.
   */
  @UseGuards(JwtAuthGuard)
  @Get('users/:id')
  async findUser(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    if (request.user.userId !== id) {
      throw new ForbiddenException(
        'You may only access your own user record',
      );
    }

    const user = await this.identityService.findUserById(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }
}