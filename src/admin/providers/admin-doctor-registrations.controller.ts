import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminArea } from '../../common/decorators/admin-area.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { UserRole } from '../../core/users/schemas/user.schema';
import { AdminDoctorRegistrationsService } from './admin-doctor-registrations.service';
import {
  DoctorRegistrationDecisionDto,
  DoctorRegistrationQueryDto,
  DoctorRegistrationResponseDto,
} from './dto/doctor-registration.dto';

@ApiTags('Admin - Providers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@AdminArea('verification', 'providers')
@Controller('admin/doctor-registrations')
export class AdminDoctorRegistrationsController {
  constructor(
    private readonly registrations: AdminDoctorRegistrationsService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      "Doctors' medical council registrations awaiting Ayuva verification (e-prescribing stays locked until verified)",
  })
  @ApiOkResponse({ type: [DoctorRegistrationResponseDto] })
  list(
    @Query() query: DoctorRegistrationQueryDto,
  ): Promise<DoctorRegistrationResponseDto[]> {
    return this.registrations.list(query);
  }

  @Patch(':memberId')
  @ApiOperation({
    summary:
      "Verify or reject a doctor's registration — the doctor is notified",
  })
  @ApiOkResponse({ type: DoctorRegistrationResponseDto })
  decide(
    @Param('memberId') memberId: string,
    @Body() dto: DoctorRegistrationDecisionDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<DoctorRegistrationResponseDto> {
    return this.registrations.decide(memberId, dto, {
      id: user.sub,
      email: user.email,
    });
  }
}
