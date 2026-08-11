import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ConsentGuard } from '../../auth/guards/consent.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { AppointmentsService } from './appointments.service';
import type { AppointmentsScope } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { PatchAppointmentDto } from './dto/patch-appointment.dto';
import { AppointmentResponseDto } from './dto/appointment-response.dto';

@ApiTags('Appointments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ConsentGuard)
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  @ApiOperation({
    summary: 'Book an appointment (FR-7.1-7.3, DC-4 atomic slot booking)',
  })
  @ApiCreatedResponse({ type: AppointmentResponseDto })
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateAppointmentDto,
  ): Promise<AppointmentResponseDto> {
    return this.appointmentsService.create(user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List appointments, optionally scoped (FR-7.5)' })
  @ApiQuery({ name: 'scope', enum: ['upcoming', 'past'], required: false })
  @ApiOkResponse({ type: [AppointmentResponseDto] })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('scope') scope?: AppointmentsScope,
  ): Promise<AppointmentResponseDto[]> {
    return this.appointmentsService.findAll(user.sub, scope);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Cancel or reschedule an upcoming appointment (FR-7.6)',
  })
  @ApiOkResponse({ type: AppointmentResponseDto })
  update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: PatchAppointmentDto,
  ): Promise<AppointmentResponseDto> {
    return this.appointmentsService.update(id, user.sub, dto);
  }
}
