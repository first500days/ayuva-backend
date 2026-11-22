import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminArea } from '../../common/decorators/admin-area.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { UserRole } from '../../core/users/schemas/user.schema';
import { CredentialDocType } from '../../core/providers/schemas/provider.schema';
import { AuditLogInterceptor } from '../../audit-log/interceptors/audit-log.interceptor';
import { AuditEvent } from '../../audit-log/decorators/audit-event.decorator';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import { AdminProvidersService } from './admin-providers.service';
import { QueryAdminProvidersDto } from './dto/query-admin-providers.dto';
import { AdminCreateProviderDto } from './dto/admin-create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { ProviderScheduleDto } from './dto/provider-schedule.dto';
import { BlockedDateDto } from './dto/blocked-date.dto';
import { ProviderVerificationDto } from './dto/provider-verification.dto';
import {
  AdminProviderResponseDto,
  ProviderCredentialResponseDto,
} from './dto/admin-provider-response.dto';
import {
  MAX_CREDENTIAL_BYTES,
  SuspendProviderDto,
  UploadCredentialDto,
} from './dto/provider-credentials.dto';
import {
  AdminDoctorCalendarResponseDto,
  AdminDoctorResponseDto,
  DoctorCalendarQueryDto,
  DoctorScheduleDto,
} from './dto/doctor-calendar.dto';

@ApiTags('Admin - Providers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@AdminArea('providers', 'appointments', 'verification')
@Controller('admin/providers')
export class AdminProvidersController {
  constructor(private readonly adminProvidersService: AdminProvidersService) {}

  @Get()
  @ApiOperation({
    summary:
      'Provider directory, searchable/filterable by type/specialty/location (FR-13.1)',
  })
  @ApiOkResponse({ type: [AdminProviderResponseDto] })
  findAll(
    @Query() query: QueryAdminProvidersDto,
  ): Promise<AdminProviderResponseDto[]> {
    return this.adminProvidersService.findAll(query);
  }

  @Post()
  @ApiOperation({ summary: 'Add a provider (FR-13.2, FR-13.3)' })
  @ApiCreatedResponse({ type: AdminProviderResponseDto })
  create(
    @Body() dto: AdminCreateProviderDto,
  ): Promise<AdminProviderResponseDto> {
    return this.adminProvidersService.create(dto);
  }

  @Get('verification-queue')
  @ApiOperation({ summary: 'Providers awaiting verification (A02)' })
  @ApiOkResponse({ type: [AdminProviderResponseDto] })
  verificationQueue(): Promise<AdminProviderResponseDto[]> {
    return this.adminProvidersService.verificationQueue();
  }

  @Patch(':id/verification')
  @ApiOperation({ summary: 'Approve / reject / mark under review (A02)' })
  @ApiOkResponse({ type: AdminProviderResponseDto })
  @AuditEvent(AuditAction.ADMIN_PROVIDER_VERIFY, 'Provider')
  @UseInterceptors(AuditLogInterceptor)
  verify(
    @Param('id') id: string,
    @Body() dto: ProviderVerificationDto,
  ): Promise<AdminProviderResponseDto> {
    return this.adminProvidersService.verify(id, dto);
  }

  @Patch(':id/suspend')
  @ApiOperation({
    summary:
      'Pause a provider: hidden from patient search and bookings, record sharing cut, reason recorded',
  })
  @ApiOkResponse({ type: AdminProviderResponseDto })
  @AuditEvent(AuditAction.ADMIN_PROVIDER_SUSPEND, 'Provider')
  @UseInterceptors(AuditLogInterceptor)
  suspend(
    @Param('id') id: string,
    @Body() dto: SuspendProviderDto,
  ): Promise<AdminProviderResponseDto> {
    return this.adminProvidersService.suspend(id, dto.reason);
  }

  @Patch(':id/reactivate')
  @ApiOperation({ summary: 'Bring a paused provider back online' })
  @ApiOkResponse({ type: AdminProviderResponseDto })
  @AuditEvent(AuditAction.ADMIN_PROVIDER_ACTIVATE, 'Provider')
  @UseInterceptors(AuditLogInterceptor)
  reactivate(@Param('id') id: string): Promise<AdminProviderResponseDto> {
    return this.adminProvidersService.reactivate(id);
  }

  @Get(':id/credentials')
  @ApiOperation({ summary: 'Licence / registration documents on file (metadata)' })
  @ApiOkResponse({ type: [ProviderCredentialResponseDto] })
  listCredentials(@Param('id') id: string): Promise<ProviderCredentialResponseDto[]> {
    return this.adminProvidersService.listCredentials(id);
  }

  @Get(':id/credentials/:credentialId/file')
  @ApiOperation({ summary: 'Stream one credential document (decrypted, inline) for review' })
  @AuditEvent(AuditAction.ADMIN_PROVIDER_CREDENTIAL_VIEW, 'Provider')
  @UseInterceptors(AuditLogInterceptor)
  async credentialFile(
    @Param('id') id: string,
    @Param('credentialId') credentialId: string,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.adminProvidersService.readCredential(id, credentialId);
    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `inline; filename="${file.fileName}"`,
      'Cache-Control': 'no-store',
    });
    res.send(file.buffer);
  }

  @Post(':id/credentials')
  @ApiOperation({ summary: 'Attach a credential document on the provider\'s behalf' })
  @ApiConsumes('multipart/form-data')
  @ApiCreatedResponse({ type: ProviderCredentialResponseDto })
  @AuditEvent(AuditAction.ADMIN_PROVIDER_CREDENTIAL_UPLOAD, 'Provider')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_CREDENTIAL_BYTES },
    }),
    AuditLogInterceptor,
  )
  addCredential(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadCredentialDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ProviderCredentialResponseDto> {
    return this.adminProvidersService.addCredential(
      id,
      file,
      dto.docType ?? CredentialDocType.MEDICAL_LICENSE,
      { userId: user.sub, role: 'admin' },
    );
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Edit/deactivate a provider (FR-13.2, FR-13.3) — status flips patient-facing visibility (FR-13.4)',
  })
  @ApiOkResponse({ type: AdminProviderResponseDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProviderDto,
  ): Promise<AdminProviderResponseDto> {
    return this.adminProvidersService.update(id, dto);
  }

  @Put(':id/schedule')
  @ApiOperation({
    summary:
      'Configure working days/hours/slot duration; regenerates AppointmentSlot availability without corrupting booked slots (FR-14.1, FR-14.2, DC-4)',
  })
  @ApiOkResponse({ type: AdminProviderResponseDto })
  updateSchedule(
    @Param('id') id: string,
    @Body() dto: ProviderScheduleDto,
  ): Promise<AdminProviderResponseDto> {
    return this.adminProvidersService.updateSchedule(id, dto);
  }

  @Post(':id/blocked-dates')
  @ApiOperation({
    summary:
      'Add a holiday/ad hoc blocked date with a reason label; invalidates open slots only (FR-14.4, DC-4)',
  })
  @ApiCreatedResponse({ type: AdminProviderResponseDto })
  addBlockedDate(
    @Param('id') id: string,
    @Body() dto: BlockedDateDto,
  ): Promise<AdminProviderResponseDto> {
    return this.adminProvidersService.addBlockedDate(id, dto);
  }

  @Delete(':id/blocked-dates/:date')
  @ApiOperation({
    summary:
      'Remove a blocked/holiday date — re-opens slots on that date if it is still a configured working day',
  })
  @ApiOkResponse({ type: AdminProviderResponseDto })
  removeBlockedDate(
    @Param('id') id: string,
    @Param('date') date: string,
  ): Promise<AdminProviderResponseDto> {
    return this.adminProvidersService.removeBlockedDate(id, date);
  }

  @Get(':id/doctors')
  @ApiOperation({ summary: "Doctors on a facility's roster (Slot Management doctor filter)" })
  @ApiOkResponse({ type: [AdminDoctorResponseDto] })
  listDoctors(@Param('id') id: string): Promise<AdminDoctorResponseDto[]> {
    return this.adminProvidersService.listDoctors(id);
  }

  @Get(':id/doctors/:memberId/calendar')
  @ApiOperation({ summary: "One doctor's duty hours and slots on a date" })
  @ApiOkResponse({ type: AdminDoctorCalendarResponseDto })
  doctorCalendar(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Query() query: DoctorCalendarQueryDto,
  ): Promise<AdminDoctorCalendarResponseDto> {
    return this.adminProvidersService.doctorCalendar(id, memberId, query.date);
  }

  @Put(':id/doctors/:memberId/schedule')
  @ApiOperation({ summary: "Set a doctor's working days and duty hours on the facility roster" })
  @ApiOkResponse({ type: AdminDoctorResponseDto })
  @AuditEvent(AuditAction.ADMIN_DOCTOR_SCHEDULE_UPDATE, 'Provider')
  @UseInterceptors(AuditLogInterceptor)
  updateDoctorSchedule(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body() dto: DoctorScheduleDto,
  ): Promise<AdminDoctorResponseDto> {
    return this.adminProvidersService.updateDoctorSchedule(id, memberId, dto);
  }
}
