import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { IdentityService } from './identity.service.js';
import {
  AuthenticatedPrincipal,
  JwtAuthGuard,
} from '../auth/guards/jwt-auth.guard.js';
import { AuthorizationService } from '../auth/authorization/authorization.service.js';
import { PERMISSIONS } from '../auth/authorization/permission.constants.js';
import { RequirePermission } from '../auth/authorization/permission.decorator.js';

interface AuthenticatedRequest {
  user: AuthenticatedPrincipal;
}

@Controller('identity')
export class IdentityController {
  constructor(
    private readonly identityService: IdentityService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post('users')
  @RequirePermission(PERMISSIONS.IDENTITY_USER_CREATE)
  async createUser(@Body() dto: CreateUserDto) {
    return this.identityService.createUser(dto);
  }

  /**
   * A caller may always read their own record.
   *
   * Reading another user's record requires the
   * identity:user:read permission.
   */
  @UseGuards(JwtAuthGuard)
  @Patch('users/:id')
  async patchUser(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const principal = request.user;

    if (principal.userId !== id) {
      const allowed =
        await this.authorizationService.userHasPermission(
          principal.userId,
          PERMISSIONS.IDENTITY_USER_UPDATE,
        );

      if (!allowed) {
        throw new ForbiddenException(
          'Insufficient permissions',
        );
      }
    }

    return this.identityService.updateUser(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('users/:id/update')
  async updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const principal = request.user;

    if (principal.userId !== id) {
      const allowed =
        await this.authorizationService.userHasPermission(
          principal.userId,
          PERMISSIONS.IDENTITY_USER_UPDATE,
        );

      if (!allowed) {
        throw new ForbiddenException(
          'Insufficient permissions',
        );
      }
    }

    return this.identityService.updateUser(
      id,
      dto,
    );
  }


  @UseGuards(JwtAuthGuard)
  @Get('users/:id')
  async findUser(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const principal = request.user;

    if (principal.userId !== id) {
      const allowed =
        await this.authorizationService.userHasPermission(
          principal.userId,
          PERMISSIONS.IDENTITY_USER_READ,
        );

      if (!allowed) {
        throw new ForbiddenException(
          'Insufficient permissions',
        );
      }
    }

    const user =
      await this.identityService.findUserById(id);

    if (!user) {
      throw new NotFoundException(
        'User not found',
      );
    }

    return user;
  }

  @UseGuards(JwtAuthGuard)
  @Delete('users/:id')
  async deleteUser(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    if (request.user.userId !== id) {
      const allowed =
        await this.authorizationService.userHasPermission(
          request.user.userId,
          PERMISSIONS.IDENTITY_USER_DELETE,
        );

      if (!allowed) {
        throw new ForbiddenException(
          'Insufficient permissions',
        );
      }
    }

    return this.identityService.deleteUser(id);
  }

}
