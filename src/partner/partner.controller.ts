import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UserRole } from '../core/users/schemas/user.schema';
import { AuthTokensResponseDto } from '../auth/dto/auth-tokens-response.dto';
import { ProviderScheduleDto } from '../admin/providers/dto/provider-schedule.dto';
import { BlockedDateDto } from '../admin/providers/dto/blocked-date.dto';
import { PartnerAuthService } from './partner-auth.service';
import { PartnerProfileService } from './partner-profile.service';
import { PartnerAppointmentsService } from './partner-appointments.service';
import { PartnerRecordsService } from './partner-records.service';
import { PartnerPaymentsService } from './partner-payments.service';
import {
  PartnerAppointmentsQueryDto,
  PartnerFollowUpDto,
  PartnerPaymentsQueryDto,
  PartnerRegisterDto,
  PartnerRescheduleDto,
  PartnerSlotsQueryDto,
  RejectAppointmentDto,
  UpdatePartnerProfileDto,
} from './dto/partner.dto';

/** P01 — public partner sign-up. Login itself reuses POST /auth/login (role "partner" in the JWT). */
@ApiTags('Partner - Auth')
@Controller('partner/auth')
export class PartnerAuthController {
  constructor(private readonly authService: PartnerAuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a partner; account stays pending until an admin verifies it (P01)' })
  @ApiCreatedResponse({ type: AuthTokensResponseDto })
  register(@Body() dto: PartnerRegisterDto): Promise<AuthTokensResponseDto> {
    return this.authService.register(dto);
  }
}

@ApiTags('Partner')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PARTNER)
@Controller('partner')
export class PartnerController {
  constructor(
    private readonly profile: PartnerProfileService,
    private readonly appointments: PartnerAppointmentsService,
    private readonly records: PartnerRecordsService,
    private readonly payments: PartnerPaymentsService,
  ) {}

  // ── P01/P02 profile, verification status, availability ─────────────────────
  @Get('me')
  @ApiOperation({ summary: 'Own provider profile incl. verification status (available while pending)' })
  me(@CurrentUser() u: JwtPayload) {
    return this.profile.getMe(u.sub);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update qualifications, specialty, fee, languages, locations (P02)' })
  updateProfile(@CurrentUser() u: JwtPayload, @Body() dto: UpdatePartnerProfileDto) {
    return this.profile.updateProfile(u.sub, dto);
  }

  @Put('schedule')
  @ApiOperation({ summary: 'Set working days/hours/slot length; regenerates slots (P02)' })
  updateSchedule(@CurrentUser() u: JwtPayload, @Body() dto: ProviderScheduleDto) {
    return this.profile.updateSchedule(u.sub, dto);
  }

  @Post('blocked-dates')
  @ApiOperation({ summary: 'Block a date (P02)' })
  addBlockedDate(@CurrentUser() u: JwtPayload, @Body() dto: BlockedDateDto) {
    return this.profile.addBlockedDate(u.sub, dto);
  }

  @Delete('blocked-dates/:date')
  @ApiOperation({ summary: 'Unblock a date (P02)' })
  removeBlockedDate(@CurrentUser() u: JwtPayload, @Param('date') date: string) {
    return this.profile.removeBlockedDate(u.sub, date);
  }

  @Get('slots')
  @ApiOperation({ summary: 'Open slots, for rescheduling and follow-ups' })
  slots(@CurrentUser() u: JwtPayload, @Query() q: PartnerSlotsQueryDto) {
    return this.profile.openSlots(u.sub, q.from);
  }

  // ── P03 dashboard ──────────────────────────────────────────────────────────
  @Get('dashboard')
  @ApiOperation({ summary: "Today's appointments, pending items, recent shared reports (P03)" })
  dashboard(@CurrentUser() u: JwtPayload) {
    return this.profile.dashboard(u.sub);
  }

  // ── P04 shared records & access log ────────────────────────────────────────
  @Get('shared-records')
  @ApiOperation({ summary: 'Active patient-approved shares (P04)' })
  shares(@CurrentUser() u: JwtPayload) {
    return this.records.listShares(u.sub);
  }

  @Get('shared-records/:grantId')
  @ApiOperation({ summary: 'Records inside one share — logged as a view against the partner (P04)' })
  share(@CurrentUser() u: JwtPayload, @Param('grantId') grantId: string) {
    return this.records.getShare(u.sub, grantId);
  }

  @Get('shared-records/:grantId/records/:recordId/file')
  @ApiOperation({ summary: 'Download a shared record file — logged (P04)' })
  async file(
    @CurrentUser() u: JwtPayload,
    @Param('grantId') grantId: string,
    @Param('recordId') recordId: string,
    @Res() res: Response,
  ) {
    const { buffer, fileName } = await this.records.downloadRecord(u.sub, grantId, recordId);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/"/g, '')}"`);
    res.send(buffer);
  }

  @Get('access-log')
  @ApiOperation({ summary: 'Every view attributable to a partner login (P04)' })
  accessLog(@CurrentUser() u: JwtPayload) {
    return this.records.accessLog(u.sub);
  }

  // ── P05 appointments ───────────────────────────────────────────────────────
  @Get('appointments')
  @ApiOperation({ summary: 'incoming | today | upcoming | completed (P05)' })
  listAppointments(@CurrentUser() u: JwtPayload, @Query() q: PartnerAppointmentsQueryDto) {
    return this.appointments.list(u.sub, q);
  }

  @Post('appointments/:id/accept')
  @HttpCode(200)
  accept(@CurrentUser() u: JwtPayload, @Param('id') id: string) {
    return this.appointments.accept(u.sub, id);
  }

  @Post('appointments/:id/reject')
  @HttpCode(200)
  reject(@CurrentUser() u: JwtPayload, @Param('id') id: string, @Body() dto: RejectAppointmentDto) {
    return this.appointments.reject(u.sub, id, dto.reason);
  }

  @Post('appointments/:id/reschedule')
  @HttpCode(200)
  reschedule(@CurrentUser() u: JwtPayload, @Param('id') id: string, @Body() dto: PartnerRescheduleDto) {
    return this.appointments.reschedule(u.sub, id, dto.newSlotId);
  }

  @Post('appointments/:id/complete')
  @HttpCode(200)
  complete(@CurrentUser() u: JwtPayload, @Param('id') id: string) {
    return this.appointments.complete(u.sub, id);
  }

  @Post('appointments/:id/follow-up')
  @ApiOperation({ summary: 'Schedule a follow-up from a completed visit (P05)' })
  followUp(@CurrentUser() u: JwtPayload, @Param('id') id: string, @Body() dto: PartnerFollowUpDto) {
    return this.appointments.scheduleFollowUp(u.sub, id, dto.slotId);
  }

  // ── P06 payments ───────────────────────────────────────────────────────────
  @Get('payments')
  @ApiOperation({ summary: 'Fee, collections, payout status, history (P06)' })
  paymentsOverview(@CurrentUser() u: JwtPayload, @Query() q: PartnerPaymentsQueryDto) {
    return this.payments.overview(u.sub, q);
  }

  @Get('payments/:id/receipt')
  @ApiOperation({ summary: 'Receipt for one transaction (P06)' })
  receipt(@CurrentUser() u: JwtPayload, @Param('id') id: string) {
    return this.payments.receipt(u.sub, id);
  }
}
