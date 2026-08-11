import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../core/users/schemas/user.schema';
import { AppointmentsService } from '../../core/appointments/appointments.service';
import { PatchAppointmentDto } from '../../core/appointments/dto/patch-appointment.dto';
import { AppointmentResponseDto } from '../../core/appointments/dto/appointment-response.dto';
import { QueryAdminAppointmentsDto } from './dto/query-admin-appointments.dto';

@ApiTags('Admin - Appointments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/appointments')
export class AdminAppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get()
  @ApiOperation({
    summary:
      'All appointments across every patient, optionally filtered by provider/status',
  })
  @ApiOkResponse({ type: [AppointmentResponseDto] })
  findAll(
    @Query() query: QueryAdminAppointmentsDto,
  ): Promise<AppointmentResponseDto[]> {
    return this.appointmentsService.adminFindAll(query);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Admin reschedule/cancel of any patient appointment (PRD Admin Portal Appointment Slot Management)',
  })
  @ApiOkResponse({ type: AppointmentResponseDto })
  update(
    @Param('id') id: string,
    @Body() dto: PatchAppointmentDto,
  ): Promise<AppointmentResponseDto> {
    return this.appointmentsService.adminUpdate(id, dto);
  }
}
