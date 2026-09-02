import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { MissionService } from './mission.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/authorization/permission.guard.js';
import { RequirePermission } from '../auth/authorization/permission.decorator.js';
import { PERMISSIONS } from '../auth/authorization/permission.constants.js';
import { CreateMissionDto } from './dto/create-mission.dto.js';

type PrincipalRequest = Request & {
  user: {
    userId: string;
  };
};

@Controller('missions')
@UseGuards(JwtAuthGuard)
export class MissionController {
  constructor(
    private readonly missionService: MissionService,
  ) {}

  @Post()
  create(
    @Req() req: PrincipalRequest,
    @Body() _dto: CreateMissionDto,
  ) {
    return this.missionService.create(
      req.user.userId,
    );
  }

  @Get()
  listMine(
    @Req() req: PrincipalRequest,
  ) {
    return this.missionService.listForCustomer(
      req.user.userId,
    );
  }

  @Get('available')
  @UseGuards(PermissionGuard)
  @RequirePermission(
    PERMISSIONS.MISSION_READ_AVAILABLE,
  )
  listAvailable() {
    return this.missionService.listAvailable();
  }

  @Get(':id')
  getById(
    @Param('id') id: string,
    @Req() req: PrincipalRequest,
  ) {
    return this.missionService.getById(
      id,
      req.user.userId,
    );
  }

  @Patch(':id/publish')
  publish(
    @Param('id') id: string,
    @Req() req: PrincipalRequest,
  ) {
    return this.missionService.publish(
      id,
      req.user.userId,
    );
  }

  @Post(':id/accept')
  @UseGuards(PermissionGuard)
  @RequirePermission(
    PERMISSIONS.MISSION_ACCEPT,
  )
  accept(
    @Param('id') id: string,
    @Req() req: PrincipalRequest,
  ) {
    return this.missionService.accept(
      id,
      req.user.userId,
    );
  }

  @Post(':id/start')
  @UseGuards(PermissionGuard)
  @RequirePermission(
    PERMISSIONS.MISSION_START,
  )
  start(
    @Param('id') id: string,
    @Req() req: PrincipalRequest,
  ) {
    return this.missionService.start(
      id,
      req.user.userId,
    );
  }

  @Post(':id/complete')
  @UseGuards(PermissionGuard)
  @RequirePermission(
    PERMISSIONS.MISSION_COMPLETE,
  )
  complete(
    @Param('id') id: string,
    @Req() req: PrincipalRequest,
  ) {
    return this.missionService.complete(
      id,
      req.user.userId,
    );
  }

  @Post(':id/cancel')
  cancel(
    @Param('id') id: string,
    @Req() req: PrincipalRequest,
  ) {
    return this.missionService.cancel(
      id,
      req.user.userId,
    );
  }

  @Post(':id/reassign/:runnerId')
  @UseGuards(PermissionGuard)
  @RequirePermission(
    PERMISSIONS.MISSION_REASSIGN,
  )
  reassign(
    @Param('id') id: string,
    @Param('runnerId') runnerId: string,
  ) {
    return this.missionService.reassign(
      id,
      runnerId,
    );
  }
}
