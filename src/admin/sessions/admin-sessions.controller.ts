import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { AdminArea } from '../../common/decorators/admin-area.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../core/users/schemas/user.schema';
import { AdminSessionsService } from './admin-sessions.service';

export class EndSessionsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}

/** Patient Support grid: end one login's sessions. */
@ApiTags('Admin - Sessions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@AdminArea('users')
@Controller('admin/users')
export class AdminUserSessionsController {
  constructor(private readonly sessions: AdminSessionsService) {}

  @Post(':id/terminate-sessions')
  @ApiOperation({ summary: 'End every web and app session of this login now' })
  end(
    @CurrentUser() admin: JwtPayload,
    @Param('id') id: string,
    @Body() dto: EndSessionsDto,
  ) {
    return this.sessions.endUser(admin.sub, id, dto.reason);
  }
}

/** Doctors & Providers grid: end every staff session of one partner organisation. */
@ApiTags('Admin - Sessions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@AdminArea('providers')
@Controller('admin/providers')
export class AdminOrgSessionsController {
  constructor(private readonly sessions: AdminSessionsService) {}

  @Post(':id/terminate-sessions')
  @ApiOperation({
    summary:
      'End every session of every staff login of this partner organisation now',
  })
  end(
    @CurrentUser() admin: JwtPayload,
    @Param('id') id: string,
    @Body() dto: EndSessionsDto,
  ) {
    return this.sessions.endOrganisation(admin.sub, id, dto.reason);
  }

  @Post(':id/lock')
  @ApiOperation({
    summary:
      'Facility kill-switch: lock this partner organisation. Every staff token stops working now, and no sign-in is allowed until it is unlocked',
  })
  lock(
    @CurrentUser() admin: JwtPayload,
    @Param('id') id: string,
    @Body() dto: EndSessionsDto,
  ) {
    return this.sessions.lockOrganisation(admin.sub, id, dto.reason);
  }

  @Post(':id/unlock')
  @ApiOperation({ summary: 'Lift the facility lock; staff can sign in again' })
  unlock(
    @CurrentUser() admin: JwtPayload,
    @Param('id') id: string,
    @Body() dto: EndSessionsDto,
  ) {
    return this.sessions.unlockOrganisation(admin.sub, id, dto.reason);
  }
}
