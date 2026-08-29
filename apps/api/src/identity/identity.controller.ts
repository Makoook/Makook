import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto.js';
import { IdentityService } from './identity.service.js';

@Controller('identity')
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  @Post('users')
  async createUser(@Body() dto: CreateUserDto) {
    return this.identityService.createUser(dto);
  }

  @Get('users/:id')
  async findUser(@Param('id') id: string) {
    const user = await this.identityService.findUserById(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }
}