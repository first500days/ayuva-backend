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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../core/users/schemas/user.schema';
import {
  PartnerCtx,
  PartnerPermGuard,
  RequirePerm,
} from './rbac/partner-perm.guard';
import type { PartnerActor } from './rbac/partner-perm.guard';
import { Perm } from './rbac/partner-permissions';
import { PartnerStaffService } from './staff/partner-staff.service';
import {
  InviteStaffDto,
  UpdateOwnStaffProfileDto,
  UpdateStaffDto,
} from './staff/dto/staff.dto';
import { PartnerSecurityService } from './security/partner-security.service';
import { ActivityQueryDto } from './security/dto/security.dto';
import { PartnerNotifySettingsService } from './notify/partner-notify-settings.service';
import { UpdateNotificationSettingsDto } from './notify/dto/notify.dto';
import { PartnerPatientsService } from './clinical/partner-patients.service';
import { PartnerTimelineService } from './clinical/partner-timeline.service';
import { PartnerNotesService } from './clinical/partner-notes.service';
import { PartnerPrescriptionsService } from './clinical/partner-prescriptions.service';
import {
  CancelPrescriptionDto,
  CreateNoteDto,
  CreatePrescriptionDto,
  NotesQueryDto,
  PatientsQueryDto,
  PrescriptionsQueryDto,
  ScribeStructureDto,
  SignPrescriptionDto,
  UpdateNoteDto,
  UpdatePrescriptionDto,
} from './clinical/dto/clinical.dto';
import { PartnerReferralsService } from './referrals/partner-referrals.service';
import {
  CreateReferralDto,
  DirectoryQueryDto,
  ReferralNoteDto,
  ReferralsQueryDto,
  RespondReferralDto,
} from './referrals/dto/referral.dto';
import { PartnerLabCatalogService } from './lab/partner-lab-catalog.service';
import { PartnerLabInventoryService } from './lab/partner-lab-inventory.service';
import { PartnerLabOrdersService } from './lab/partner-lab-orders.service';
import { PartnerLabResultsService } from './lab/partner-lab-results.service';
import {
  AdjustStockDto,
  AdvanceLabOrderDto,
  CatalogQueryDto,
  CreateCatalogItemDto,
  CreateInventoryItemDto,
  CreateLabOrderDto,
  LabOrdersQueryDto,
  SaveResultDto,
  UpdateCatalogItemDto,
  UpdateInventoryItemDto,
  UpdateLabOrderDto,
  UploadReportDto,
} from './lab/dto/lab.dto';
import { PartnerWardsService } from './hospital/partner-wards.service';
import { PartnerClaimsService } from './hospital/partner-claims.service';
import { PartnerAnalyticsService } from './hospital/partner-analytics.service';
import {
  AddBedsDto,
  AdmissionsQueryDto,
  AdmitDto,
  AnalyticsQueryDto,
  ClaimsQueryDto,
  ClaimStatusDto,
  CreateClaimDto,
  CreateWardDto,
  DischargeDto,
  SetBedStatusDto,
  TransferDto,
  UpdateClaimDto,
  UpdateWardDto,
} from './hospital/dto/hospital.dto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../audit-log/schemas/audit-log.schema';

const REPORT_MAX_BYTES = 20 * 1024 * 1024;
const DICOM_MAX_BYTES = 60 * 1024 * 1024;

function sendFile(
  res: Response,
  buffer: Buffer,
  fileName: string,
  contentType = 'application/pdf',
  inline = true,
) {
  const safe = fileName.replace(/["\r\n]/g, '');
  res.setHeader('Content-Type', contentType);
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename="${safe}"`,
  );
  res.setHeader('Cache-Control', 'no-store');
  res.send(buffer);
}

/** Staff Management & Roster. */
@ApiTags('Partner - Staff')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PartnerPermGuard)
@Roles(UserRole.PARTNER)
@Controller('partner/staff')
export class PartnerStaffController {
  constructor(private readonly staff: PartnerStaffService) {}

  @Get()
  @RequirePerm(Perm.STAFF_VIEW)
  @ApiOperation({
    summary: 'Staff & practitioner roster with roles, duty hours and workload',
  })
  list(@PartnerCtx() a: PartnerActor) {
    return this.staff.list(a);
  }

  @Patch('me')
  @ApiOperation({
    summary: 'Update my own title, phone and registration number',
  })
  updateMe(
    @PartnerCtx() a: PartnerActor,
    @Body() dto: UpdateOwnStaffProfileDto,
  ) {
    return this.staff.updateOwnProfile(a, dto);
  }

  @Post()
  @RequirePerm(Perm.STAFF_MANAGE)
  @ApiOperation({
    summary: 'Invite a staff member (Admin, Doctor, Nurse, Technician, …)',
  })
  invite(@PartnerCtx() a: PartnerActor, @Body() dto: InviteStaffDto) {
    return this.staff.invite(a, dto);
  }

  @Patch(':id')
  @RequirePerm(Perm.STAFF_MANAGE)
  @ApiOperation({ summary: 'Change role, department, title or duty schedule' })
  update(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.staff.update(a, id, dto);
  }

  @Post(':id/suspend')
  @HttpCode(200)
  @RequirePerm(Perm.STAFF_MANAGE)
  suspend(@PartnerCtx() a: PartnerActor, @Param('id') id: string) {
    return this.staff.suspend(a, id);
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @RequirePerm(Perm.STAFF_MANAGE)
  reactivate(@PartnerCtx() a: PartnerActor, @Param('id') id: string) {
    return this.staff.reactivate(a, id);
  }

  @Post(':id/resend-invite')
  @HttpCode(200)
  @RequirePerm(Perm.STAFF_MANAGE)
  resend(@PartnerCtx() a: PartnerActor, @Param('id') id: string) {
    return this.staff.resendInvite(a, id);
  }

  @Delete(':id')
  @RequirePerm(Perm.STAFF_MANAGE)
  @ApiOperation({ summary: 'Withdraw an unaccepted invitation' })
  revoke(@PartnerCtx() a: PartnerActor, @Param('id') id: string) {
    return this.staff.revokeInvite(a, id);
  }
}

/** Security & Logs. */
@ApiTags('Partner - Security & Logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PartnerPermGuard)
@Roles(UserRole.PARTNER)
@Controller('partner/security')
export class PartnerSecurityController {
  constructor(private readonly security: PartnerSecurityService) {}

  @Get('activity')
  @RequirePerm(Perm.SECURITY_AUDIT)
  @ApiOperation({
    summary:
      'Who accessed which patient record and when, plus staff actions and logins',
  })
  activity(@PartnerCtx() a: PartnerActor, @Query() q: ActivityQueryDto) {
    return this.security.activity(a, q);
  }

  @Get('summary')
  @RequirePerm(Perm.SECURITY_AUDIT)
  summary(@PartnerCtx() a: PartnerActor) {
    return this.security.summary(a);
  }
}

/** Notification Center configuration. */
@ApiTags('Partner - Notification Center')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PartnerPermGuard)
@Roles(UserRole.PARTNER)
@Controller('partner/notification-settings')
export class PartnerNotifyController {
  constructor(
    private readonly settings: PartnerNotifySettingsService,
    private readonly audit: AuditLogService,
  ) {}

  @Get()
  @RequirePerm(Perm.ORG_SETTINGS)
  get(@PartnerCtx() a: PartnerActor) {
    return this.settings.get(a.provider._id);
  }

  @Put()
  @RequirePerm(Perm.ORG_SETTINGS)
  @ApiOperation({
    summary:
      'Trigger × channel matrix (in-app, email, SMS, desktop, webhook) and webhook endpoint',
  })
  async update(
    @PartnerCtx() a: PartnerActor,
    @Body() dto: UpdateNotificationSettingsDto,
  ) {
    const result = await this.settings.update(a.provider._id, dto);
    await this.audit.record({
      actorId: a.userId,
      action: AuditAction.PARTNER_SETTINGS_UPDATE,
      targetType: 'PartnerNotificationSettings',
      metadata: {
        providerId: a.provider.id,
        label: 'Notification settings',
        webhook: dto.webhook?.enabled,
      },
      ipAddress: a.ip,
    });
    return result;
  }

  @Post('webhook/rotate-secret')
  @HttpCode(200)
  @RequirePerm(Perm.ORG_SETTINGS)
  rotate(@PartnerCtx() a: PartnerActor) {
    return this.settings.rotateSecret(a.provider._id);
  }

  @Post('webhook/test')
  @HttpCode(200)
  @RequirePerm(Perm.ORG_SETTINGS)
  test(@PartnerCtx() a: PartnerActor) {
    return this.settings.sendTest(a.provider._id);
  }

  @Get('webhook/deliveries')
  @RequirePerm(Perm.ORG_SETTINGS)
  deliveries(@PartnerCtx() a: PartnerActor) {
    return this.settings.deliveries(a.provider._id);
  }

  @Get('desktop-triggers')
  @ApiOperation({
    summary:
      'Feed triggers this member’s portal should raise desktop alerts for',
  })
  desktop(@PartnerCtx() a: PartnerActor) {
    return this.settings.desktopTriggers(a.provider._id, a.role);
  }
}

/** Patients, Health Timeline, Clinical Notes (AYUVA Scribe) and E-Rx. */
@ApiTags('Partner - Clinical')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PartnerPermGuard)
@Roles(UserRole.PARTNER)
@Controller('partner')
export class PartnerClinicalController {
  constructor(
    private readonly patients: PartnerPatientsService,
    private readonly timeline: PartnerTimelineService,
    private readonly notes: PartnerNotesService,
    private readonly rx: PartnerPrescriptionsService,
  ) {}

  @Get('patients')
  @RequirePerm(Perm.PATIENTS_VIEW)
  @ApiOperation({
    summary:
      'Patients linked to the organisation (bookings, shares, referrals, orders, admissions)',
  })
  listPatients(@PartnerCtx() a: PartnerActor, @Query() q: PatientsQueryDto) {
    return this.patients.list(a, q);
  }

  @Get('patients/:id')
  @RequirePerm(Perm.PATIENTS_VIEW)
  patient(@PartnerCtx() a: PartnerActor, @Param('id') id: string) {
    return this.patients.summary(a, id);
  }

  @Get('patients/:id/timeline')
  @RequirePerm(Perm.PATIENTS_VIEW)
  @ApiOperation({
    summary:
      'Chronological health timeline; shared vault records need records.view and are access-logged',
  })
  patientTimeline(@PartnerCtx() a: PartnerActor, @Param('id') id: string) {
    return this.timeline.timeline(a, id);
  }

  @Post('scribe/structure')
  @HttpCode(200)
  @RequirePerm(Perm.CLINICAL_WRITE)
  @ApiOperation({
    summary:
      'AYUVA Scribe: structure the doctor’s own typed/dictated notes (mock until the AI model is live)',
  })
  structure(@PartnerCtx() a: PartnerActor, @Body() dto: ScribeStructureDto) {
    return this.notes.structure(a, dto.text);
  }

  @Get('notes')
  @RequirePerm(Perm.PATIENTS_VIEW)
  listNotes(@PartnerCtx() a: PartnerActor, @Query() q: NotesQueryDto) {
    return this.notes.list(a, q);
  }

  @Get('notes/:id')
  @RequirePerm(Perm.PATIENTS_VIEW)
  note(@PartnerCtx() a: PartnerActor, @Param('id') id: string) {
    return this.notes.get(a, id);
  }

  @Get('notes/:id/pdf')
  @RequirePerm(Perm.PATIENTS_VIEW)
  async notePdf(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const note = await this.notes.loadReadable(a, id);
    sendFile(
      res,
      this.notes.pdf(a, note),
      `Visit summary ${note.patientName}.pdf`,
    );
  }

  @Post('notes')
  @RequirePerm(Perm.CLINICAL_WRITE)
  createNote(@PartnerCtx() a: PartnerActor, @Body() dto: CreateNoteDto) {
    return this.notes.create(a, dto);
  }

  @Patch('notes/:id')
  @RequirePerm(Perm.CLINICAL_WRITE)
  updateNote(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: UpdateNoteDto,
  ) {
    return this.notes.update(a, id, dto);
  }

  @Post('notes/:id/sign')
  @HttpCode(200)
  @RequirePerm(Perm.CLINICAL_WRITE)
  signNote(@PartnerCtx() a: PartnerActor, @Param('id') id: string) {
    return this.notes.sign(a, id);
  }

  @Post('notes/:id/share')
  @HttpCode(200)
  @RequirePerm(Perm.CLINICAL_WRITE)
  @ApiOperation({
    summary: "Send the signed visit summary to the patient's Medical Vault",
  })
  shareNote(@PartnerCtx() a: PartnerActor, @Param('id') id: string) {
    return this.notes.shareWithPatient(a, id);
  }

  @Delete('notes/:id')
  @RequirePerm(Perm.CLINICAL_WRITE)
  deleteNote(@PartnerCtx() a: PartnerActor, @Param('id') id: string) {
    return this.notes.remove(a, id);
  }

  @Get('prescriptions')
  @RequirePerm(Perm.PATIENTS_VIEW)
  listRx(@PartnerCtx() a: PartnerActor, @Query() q: PrescriptionsQueryDto) {
    return this.rx.list(a, q);
  }

  @Get('prescriptions/:id')
  @RequirePerm(Perm.PATIENTS_VIEW)
  getRx(@PartnerCtx() a: PartnerActor, @Param('id') id: string) {
    return this.rx.get(a, id);
  }

  @Get('prescriptions/:id/pdf')
  @RequirePerm(Perm.PATIENTS_VIEW)
  async rxPdf(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { buffer, fileName } = await this.rx.pdf(a, id);
    sendFile(res, buffer, fileName);
  }

  @Post('prescriptions')
  @RequirePerm(Perm.CLINICAL_WRITE)
  createRx(@PartnerCtx() a: PartnerActor, @Body() dto: CreatePrescriptionDto) {
    return this.rx.create(a, dto);
  }

  @Patch('prescriptions/:id')
  @RequirePerm(Perm.CLINICAL_WRITE)
  updateRx(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: UpdatePrescriptionDto,
  ) {
    return this.rx.update(a, id, dto);
  }

  @Post('prescriptions/:id/sign')
  @HttpCode(200)
  @RequirePerm(Perm.CLINICAL_WRITE)
  @ApiOperation({
    summary:
      'Sign: freezes the Rx, delivers the PDF to the patient vault and optionally a pharmacy',
  })
  signRx(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: SignPrescriptionDto,
  ) {
    return this.rx.sign(a, id, dto);
  }

  @Post('prescriptions/:id/cancel')
  @HttpCode(200)
  @RequirePerm(Perm.CLINICAL_WRITE)
  cancelRx(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: CancelPrescriptionDto,
  ) {
    return this.rx.cancel(a, id, dto.reason);
  }

  @Delete('prescriptions/:id')
  @RequirePerm(Perm.CLINICAL_WRITE)
  deleteRx(@PartnerCtx() a: PartnerActor, @Param('id') id: string) {
    return this.rx.remove(a, id);
  }
}

/** Referral Outbox / Referral Management. */
@ApiTags('Partner - Referrals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PartnerPermGuard)
@Roles(UserRole.PARTNER)
@Controller('partner/referrals')
export class PartnerReferralsController {
  constructor(private readonly referrals: PartnerReferralsService) {}

  @Get()
  @RequirePerm(Perm.REFERRALS_VIEW)
  list(@PartnerCtx() a: PartnerActor, @Query() q: ReferralsQueryDto) {
    return this.referrals.list(a, q);
  }

  @Get('directory')
  @RequirePerm(Perm.REFERRALS_MANAGE)
  @ApiOperation({
    summary:
      'Verified Ayuva doctors, hospitals and diagnostic centres to refer to',
  })
  directory(@PartnerCtx() a: PartnerActor, @Query() q: DirectoryQueryDto) {
    return this.referrals.directory(a, q);
  }

  @Get(':id')
  @RequirePerm(Perm.REFERRALS_VIEW)
  get(@PartnerCtx() a: PartnerActor, @Param('id') id: string) {
    return this.referrals.get(a, id);
  }

  @Get(':id/letter')
  @RequirePerm(Perm.REFERRALS_VIEW)
  async letter(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { buffer, fileName } = await this.referrals.letter(a, id);
    sendFile(res, buffer, fileName);
  }

  @Post()
  @RequirePerm(Perm.REFERRALS_MANAGE)
  create(@PartnerCtx() a: PartnerActor, @Body() dto: CreateReferralDto) {
    return this.referrals.create(a, dto);
  }

  @Post(':id/respond')
  @HttpCode(200)
  @RequirePerm(Perm.REFERRALS_MANAGE)
  respond(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: RespondReferralDto,
  ) {
    return this.referrals.respond(a, id, dto.decision, dto.note);
  }

  @Post(':id/complete')
  @HttpCode(200)
  @RequirePerm(Perm.REFERRALS_MANAGE)
  complete(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: ReferralNoteDto,
  ) {
    return this.referrals.complete(a, id, dto.note);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePerm(Perm.REFERRALS_MANAGE)
  cancel(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: ReferralNoteDto,
  ) {
    return this.referrals.cancel(a, id, dto.note);
  }
}

/** Diagnostic centre: Lab Queue, Report Builder/Uploader, Imaging, Test Catalog, Inventory. */
@ApiTags('Partner - Lab')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PartnerPermGuard)
@Roles(UserRole.PARTNER)
@Controller('partner/lab')
export class PartnerLabController {
  constructor(
    private readonly catalog: PartnerLabCatalogService,
    private readonly inventory: PartnerLabInventoryService,
    private readonly orders: PartnerLabOrdersService,
    private readonly results: PartnerLabResultsService,
  ) {}

  // Catalogue
  @Get('catalog')
  @RequirePerm(Perm.LAB_ORDERS_VIEW)
  listCatalog(@PartnerCtx() a: PartnerActor, @Query() q: CatalogQueryDto) {
    return this.catalog.list(a, q);
  }

  @Post('catalog')
  @RequirePerm(Perm.LAB_CATALOG)
  createTest(@PartnerCtx() a: PartnerActor, @Body() dto: CreateCatalogItemDto) {
    return this.catalog.create(a, dto);
  }

  @Post('catalog/import-starter')
  @HttpCode(200)
  @RequirePerm(Perm.LAB_CATALOG)
  @ApiOperation({
    summary:
      'Import common tests with starter reference ranges (lab must verify against its analysers)',
  })
  importStarter(@PartnerCtx() a: PartnerActor) {
    return this.catalog.importStarter(a);
  }

  @Patch('catalog/:id')
  @RequirePerm(Perm.LAB_CATALOG)
  updateTest(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: UpdateCatalogItemDto,
  ) {
    return this.catalog.update(a, id, dto);
  }

  // Inventory
  @Get('inventory')
  @RequirePerm(Perm.LAB_INVENTORY)
  listInventory(@PartnerCtx() a: PartnerActor) {
    return this.inventory.list(a);
  }

  @Post('inventory')
  @RequirePerm(Perm.LAB_INVENTORY)
  createItem(
    @PartnerCtx() a: PartnerActor,
    @Body() dto: CreateInventoryItemDto,
  ) {
    return this.inventory.create(a, dto);
  }

  @Patch('inventory/:id')
  @RequirePerm(Perm.LAB_INVENTORY)
  updateItem(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: UpdateInventoryItemDto,
  ) {
    return this.inventory.update(a, id, dto);
  }

  @Post('inventory/:id/adjust')
  @HttpCode(200)
  @RequirePerm(Perm.LAB_INVENTORY)
  adjust(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: AdjustStockDto,
  ) {
    return this.inventory.adjust(a, id, dto);
  }

  @Delete('inventory/:id')
  @RequirePerm(Perm.LAB_INVENTORY)
  removeItem(@PartnerCtx() a: PartnerActor, @Param('id') id: string) {
    return this.inventory.remove(a, id);
  }

  // Orders (Lab Queue)
  @Get('summary')
  @RequirePerm(Perm.LAB_ORDERS_VIEW)
  summary(@PartnerCtx() a: PartnerActor) {
    return this.orders.summary(a);
  }

  @Get('orders')
  @RequirePerm(Perm.LAB_ORDERS_VIEW)
  listOrders(@PartnerCtx() a: PartnerActor, @Query() q: LabOrdersQueryDto) {
    return this.orders.list(a, q);
  }

  @Get('orders/:id')
  @RequirePerm(Perm.LAB_ORDERS_VIEW)
  getOrder(@PartnerCtx() a: PartnerActor, @Param('id') id: string) {
    return this.orders.get(a, id);
  }

  @Post('orders')
  @RequirePerm(Perm.LAB_ORDERS_MANAGE)
  createOrder(@PartnerCtx() a: PartnerActor, @Body() dto: CreateLabOrderDto) {
    return this.orders.create(a, dto);
  }

  @Patch('orders/:id')
  @RequirePerm(Perm.LAB_ORDERS_MANAGE)
  @ApiOperation({
    summary:
      'Assign technician / phlebotomist, priority, collection, payment, PACS link',
  })
  updateOrder(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: UpdateLabOrderDto,
  ) {
    return this.orders.update(a, id, dto);
  }

  @Post('orders/:id/status')
  @HttpCode(200)
  @RequirePerm(Perm.LAB_ORDERS_MANAGE)
  advance(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: AdvanceLabOrderDto,
  ) {
    return this.orders.advance(a, id, dto);
  }

  // Results (Report Builder / Uploader)
  @Get('orders/:id/result')
  @RequirePerm(Perm.LAB_ORDERS_VIEW)
  getResult(@PartnerCtx() a: PartnerActor, @Param('id') id: string) {
    return this.results.get(a, id);
  }

  @Put('orders/:id/result')
  @RequirePerm(Perm.LAB_REPORTS_DRAFT)
  saveResult(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: SaveResultDto,
  ) {
    return this.results.save(a, id, dto);
  }

  @Get('orders/:id/result/preview')
  @RequirePerm(Perm.LAB_ORDERS_VIEW)
  async preview(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { buffer, fileName } = await this.results.preview(a, id);
    sendFile(res, buffer, fileName);
  }

  @Post('orders/:id/result/release')
  @HttpCode(200)
  @RequirePerm(Perm.LAB_REPORTS_RELEASE)
  @ApiOperation({
    summary:
      "Sign off and deliver the report to the patient's vault; alerts the referrer (critical → emergency alert)",
  })
  release(@PartnerCtx() a: PartnerActor, @Param('id') id: string) {
    return this.results.release(a, id);
  }

  @Post('orders/:id/report-upload')
  @HttpCode(200)
  @RequirePerm(Perm.LAB_REPORTS_RELEASE)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: REPORT_MAX_BYTES },
    }),
  )
  upload(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadReportDto,
  ) {
    return this.results.upload(a, id, file, dto);
  }

  // Imaging (DICOM)
  @Get('imaging/referred')
  @RequirePerm(Perm.IMAGING_VIEW)
  @ApiOperation({
    summary:
      'Studies from diagnostic centres for patients my organisation referred',
  })
  referredImaging(
    @PartnerCtx() a: PartnerActor,
    @Query('patientId') patientId?: string,
  ) {
    return this.orders.referredImaging(a, patientId);
  }

  @Post('orders/:id/imaging')
  @RequirePerm(Perm.LAB_ORDERS_MANAGE)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: DICOM_MAX_BYTES },
    }),
  )
  addImaging(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('description') description?: string,
  ) {
    return this.orders.addImaging(a, id, file, description);
  }

  @Get('orders/:id/imaging/:fileId')
  @RequirePerm(Perm.IMAGING_VIEW)
  async readImaging(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @Res() res: Response,
  ) {
    const { buffer, fileName } = await this.orders.readImaging(a, id, fileId);
    sendFile(res, buffer, fileName, 'application/dicom', false);
  }

  @Delete('orders/:id/imaging/:fileId')
  @RequirePerm(Perm.LAB_ORDERS_MANAGE)
  removeImaging(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Param('fileId') fileId: string,
  ) {
    return this.orders.removeImaging(a, id, fileId);
  }
}

/** Hospital: wards & admissions, claims, analytics, billing. */
@ApiTags('Partner - Hospital & Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PartnerPermGuard)
@Roles(UserRole.PARTNER)
@Controller('partner')
export class PartnerHospitalController {
  constructor(
    private readonly wards: PartnerWardsService,
    private readonly claims: PartnerClaimsService,
    private readonly analytics: PartnerAnalyticsService,
  ) {}

  @Get('wards')
  @RequirePerm(Perm.WARDS_VIEW)
  @ApiOperation({ summary: 'Bed board: wards with live bed status' })
  listWards(@PartnerCtx() a: PartnerActor) {
    return this.wards.listWards(a);
  }

  @Get('wards/census')
  @RequirePerm(Perm.WARDS_VIEW)
  census(@PartnerCtx() a: PartnerActor) {
    return this.wards.census(a);
  }

  @Post('wards')
  @RequirePerm(Perm.ORG_SETTINGS)
  createWard(@PartnerCtx() a: PartnerActor, @Body() dto: CreateWardDto) {
    return this.wards.createWard(a, dto);
  }

  @Patch('wards/:id')
  @RequirePerm(Perm.ORG_SETTINGS)
  updateWard(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: UpdateWardDto,
  ) {
    return this.wards.updateWard(a, id, dto);
  }

  @Post('wards/:id/beds')
  @RequirePerm(Perm.ORG_SETTINGS)
  addBeds(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: AddBedsDto,
  ) {
    return this.wards.addBeds(a, id, dto);
  }

  @Patch('wards/:id/beds/:bedId')
  @RequirePerm(Perm.WARDS_MANAGE)
  setBed(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Param('bedId') bedId: string,
    @Body() dto: SetBedStatusDto,
  ) {
    return this.wards.setBedStatus(a, id, bedId, dto.status);
  }

  @Delete('wards/:id')
  @RequirePerm(Perm.ORG_SETTINGS)
  removeWard(@PartnerCtx() a: PartnerActor, @Param('id') id: string) {
    return this.wards.removeWard(a, id);
  }

  @Get('admissions')
  @RequirePerm(Perm.WARDS_VIEW)
  admissions(@PartnerCtx() a: PartnerActor, @Query() q: AdmissionsQueryDto) {
    return this.wards.listAdmissions(a, q);
  }

  @Post('admissions')
  @RequirePerm(Perm.WARDS_MANAGE)
  admit(@PartnerCtx() a: PartnerActor, @Body() dto: AdmitDto) {
    return this.wards.admit(a, dto);
  }

  @Post('admissions/:id/transfer')
  @HttpCode(200)
  @RequirePerm(Perm.WARDS_MANAGE)
  transfer(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: TransferDto,
  ) {
    return this.wards.transfer(a, id, dto);
  }

  @Post('admissions/:id/discharge')
  @HttpCode(200)
  @RequirePerm(Perm.WARDS_MANAGE)
  discharge(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: DischargeDto,
  ) {
    return this.wards.discharge(a, id, dto);
  }

  @Get('claims')
  @RequirePerm(Perm.CLAIMS_MANAGE)
  listClaims(@PartnerCtx() a: PartnerActor, @Query() q: ClaimsQueryDto) {
    return this.claims.list(a, q);
  }

  @Post('claims')
  @RequirePerm(Perm.CLAIMS_MANAGE)
  createClaim(@PartnerCtx() a: PartnerActor, @Body() dto: CreateClaimDto) {
    return this.claims.create(a, dto);
  }

  @Patch('claims/:id')
  @RequirePerm(Perm.CLAIMS_MANAGE)
  updateClaim(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: UpdateClaimDto,
  ) {
    return this.claims.update(a, id, dto);
  }

  @Post('claims/:id/status')
  @HttpCode(200)
  @RequirePerm(Perm.CLAIMS_MANAGE)
  claimStatus(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: ClaimStatusDto,
  ) {
    return this.claims.setStatus(a, id, dto);
  }

  @Get('analytics')
  @RequirePerm(Perm.ANALYTICS)
  @ApiOperation({
    summary:
      'Busy hours, department volume & revenue, staff workload, utilisation',
  })
  analyticsView(@PartnerCtx() a: PartnerActor, @Query() q: AnalyticsQueryDto) {
    return this.analytics.analytics(a, q.days ?? 30);
  }

  @Get('billing')
  @RequirePerm(Perm.BILLING_VIEW)
  @ApiOperation({
    summary:
      'Revenue today/week/month, payment methods, payouts, lab billing and claims',
  })
  billing(@PartnerCtx() a: PartnerActor, @Query() q: AnalyticsQueryDto) {
    return this.analytics.billing(a, q.days ?? 30);
  }
}
