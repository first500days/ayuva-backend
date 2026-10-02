import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ShareGrant, ShareGrantDocument } from './schemas/share-grant.schema';
import {
  ShareOrganisation,
  ShareOrganisationDocument,
} from './schemas/share-organisation.schema';
import { AccessLog, AccessLogDocument } from './schemas/access-log.schema';
import {
  MedicalRecord,
  MedicalRecordDocument,
} from '../records/schemas/medical-record.schema';
import {
  Appointment,
  AppointmentDocument,
  AppointmentStatus,
} from '../appointments/schemas/appointment.schema';
import {
  AppointmentSlot,
  AppointmentSlotDocument,
} from '../providers/schemas/appointment-slot.schema';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import { AppNotificationsService } from '../../notifications/app-notifications.service';
import {
  CreateGrantDto,
  ShareGrantResponseDto,
  ShareOrganisationResponseDto,
  AccessLogResponseDto,
} from './dto/sharing.dto';
import {
  DEFAULT_ROLLING_MONTHS,
  describeScope,
  ShareDuration,
  ShareScope,
  VISIT_GRACE_MS,
} from './share-scope';

const DURATION_TO_MS: Record<string, number | null> = {
  // v1 values — still honoured for display, no longer accepted on create.
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  [ShareDuration.DAYS_30]: 30 * 24 * 60 * 60 * 1000,
  [ShareDuration.UNTIL_REVOKED]: null,
};

// Appointment states a "this visit" grant can still be attached to.
const OPEN_APPOINTMENT_STATUSES = [
  AppointmentStatus.REQUESTED,
  AppointmentStatus.PENDING,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.RESCHEDULED,
];

@Injectable()
export class SharingService {
  private readonly logger = new Logger(SharingService.name);

  constructor(
    @InjectModel(ShareGrant.name)
    private readonly grantModel: Model<ShareGrantDocument>,
    @InjectModel(ShareOrganisation.name)
    private readonly orgModel: Model<ShareOrganisationDocument>,
    @InjectModel(AccessLog.name)
    private readonly logModel: Model<AccessLogDocument>,
    @InjectModel(MedicalRecord.name)
    private readonly recordModel: Model<MedicalRecordDocument>,
    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,
    @InjectModel(AppointmentSlot.name)
    private readonly slotModel: Model<AppointmentSlotDocument>,
    private readonly audit: AuditLogService,
    private readonly notifications: AppNotificationsService,
  ) {}

  /** Share recipients: verified partners only (an org is `connected` once its provider is approved). */
  async listOrganisations(): Promise<ShareOrganisationResponseDto[]> {
    const orgs = await this.orgModel.find({ connected: true }).sort({ name: 1 }).exec();
    return orgs.map((o) => ({
      id: o.id,
      name: o.name,
      type: o.type,
      address: o.address,
      connected: o.connected,
      providerId: o.providerId?.toString(),
    }));
  }

  async listGrants(userId: string): Promise<ShareGrantResponseDto[]> {
    const grants = await this.grantModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ grantedAt: -1 })
      .exec();
    return grants.map((g) => this.toGrantResponse(g));
  }

  async getGrant(userId: string, id: string): Promise<ShareGrantResponseDto> {
    const grant = await this.getOwnedGrantOrThrow(userId, id);
    return this.toGrantResponse(grant);
  }

  async createGrant(
    userId: string,
    dto: CreateGrantDto,
  ): Promise<ShareGrantResponseDto> {
    const patientId = new Types.ObjectId(userId);

    // Default is no access: the recipient must exist and be a verified partner.
    const org = Types.ObjectId.isValid(dto.organisationId)
      ? await this.orgModel.findOne({ _id: dto.organisationId, connected: true })
      : null;
    if (!org) {
      throw new NotFoundException('Partner not found or not verified');
    }

    let recordIds: string[] = [];
    let recordTitles: string[] = [];
    if (dto.scopeKind === ShareScope.DOCUMENTS) {
      const ids = [...new Set(dto.recordIds ?? [])];
      const owned = await this.recordModel
        .find({ _id: { $in: ids }, patientId })
        .select('originalFileName')
        .exec();
      if (owned.length !== ids.length) {
        throw new NotFoundException('One or more records were not found');
      }
      recordIds = owned.map((r) => r.id);
      recordTitles = owned.map((r) => r.originalFileName);
    }

    let expiresAt: Date | undefined;
    let appointmentId: Types.ObjectId | undefined;
    if (dto.duration === ShareDuration.VISIT) {
      const visit = await this.resolveVisit(patientId, dto.appointmentId!, org);
      appointmentId = visit.appointmentId;
      expiresAt = visit.expiresAt;
    } else {
      const ms = DURATION_TO_MS[dto.duration];
      expiresAt = ms ? new Date(Date.now() + ms) : undefined;
    }

    const grant = await this.grantModel.create({
      userId: patientId,
      organisationId: org.id,
      organisationName: org.name,
      scopeKind: dto.scopeKind,
      recordIds,
      recordTitles,
      recordTypes: dto.scopeKind === ShareScope.TYPES ? [...new Set(dto.recordTypes)] : [],
      ...(dto.scopeKind === ShareScope.ROLLING_MONTHS && {
        rollingMonths: dto.rollingMonths ?? DEFAULT_ROLLING_MONTHS,
      }),
      purpose: dto.purpose,
      duration: dto.duration,
      appointmentId,
      status: 'active',
      expiresAt,
    });
    const scopeLabel = describeScope(grant);

    await this.logModel.create({
      userId: patientId,
      grantId: grant.id,
      organisationName: org.name,
      recordTitle: scopeLabel,
      action: 'granted',
    });
    await this.audit.record({
      actorId: userId,
      action: AuditAction.SHARE_GRANT,
      targetType: 'ShareGrant',
      targetId: grant.id,
      metadata: {
        organisationId: org.id,
        providerId: org.providerId?.toString(),
        scopeKind: grant.scopeKind,
        recordTypes: grant.recordTypes,
        rollingMonths: grant.rollingMonths,
        recordCount: recordIds.length,
        duration: grant.duration,
        expiresAt: expiresAt?.toISOString(),
      },
    });
    // A grant is never silent to the patient (U11).
    await this.notifyConsentEvent(userId, grant, 'granted', scopeLabel);

    return this.toGrantResponse(grant);
  }

  async revokeGrant(userId: string, id: string): Promise<ShareGrantResponseDto> {
    const grant = await this.getOwnedGrantOrThrow(userId, id);
    if (grant.status === 'revoked') return this.toGrantResponse(grant);
    await this.revoke(grant, userId, 'patient');
    return this.toGrantResponse(grant);
  }

  /**
   * "This visit" access ends with the visit: called when the appointment is
   * cancelled by either side or rejected by the partner.
   */
  async revokeForAppointment(appointmentId: string, reason: string): Promise<number> {
    if (!Types.ObjectId.isValid(appointmentId)) return 0;
    const grants = await this.grantModel
      .find({ appointmentId: new Types.ObjectId(appointmentId), status: 'active' })
      .exec();
    for (const grant of grants) {
      await this.revoke(grant, grant.userId.toString(), reason).catch((err: unknown) =>
        this.logger.error(`Failed to revoke visit grant ${grant.id}`, err as Error),
      );
    }
    return grants.length;
  }

  /** A rescheduled visit moves its "this visit" access window with it. */
  async syncVisitExpiry(appointmentId: string): Promise<void> {
    if (!Types.ObjectId.isValid(appointmentId)) return;
    const appointment = await this.appointmentModel.findById(appointmentId);
    const slot = appointment && (await this.slotModel.findById(appointment.slotId));
    if (!slot) return;
    const expiresAt = new Date(slotStart(slot.date, slot.time).getTime() + VISIT_GRACE_MS);
    await this.grantModel.updateMany(
      { appointmentId: appointment._id, status: 'active', duration: ShareDuration.VISIT },
      { $set: { expiresAt } },
    );
  }

  async getAccessLog(userId: string): Promise<AccessLogResponseDto[]> {
    const logs = await this.logModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ occurredAt: -1 })
      .limit(100)
      .exec();
    return logs.map((l) => ({
      id: l.id,
      grantId: l.grantId,
      organisationName: l.organisationName,
      recordTitle: l.recordTitle,
      action: l.action,
      viewerName: l.viewerName,
      occurredAt: (l.occurredAt ?? new Date()).toISOString(),
    }));
  }

  private async revoke(
    grant: ShareGrantDocument,
    actorId: string,
    reason: string,
  ): Promise<void> {
    grant.status = 'revoked';
    grant.revokedAt = new Date();
    await grant.save();

    const scopeLabel = describeScope(grant);
    await this.logModel.create({
      userId: grant.userId,
      grantId: grant.id,
      organisationName: grant.organisationName,
      recordTitle: scopeLabel,
      action: 'revoked',
    });
    await this.audit.record({
      actorId,
      action: AuditAction.SHARE_REVOKE,
      targetType: 'ShareGrant',
      targetId: grant.id,
      metadata: { organisationId: grant.organisationId, reason },
    });
    await this.notifyConsentEvent(grant.userId.toString(), grant, 'revoked', scopeLabel);
  }

  /**
   * The appointment must be the patient's own, still open, and with this
   * partner. Access lasts until a day after the visit.
   */
  private async resolveVisit(
    patientId: Types.ObjectId,
    appointmentId: string,
    org: ShareOrganisationDocument,
  ): Promise<{ appointmentId: Types.ObjectId; expiresAt: Date }> {
    const appointment = Types.ObjectId.isValid(appointmentId)
      ? await this.appointmentModel.findOne({ _id: appointmentId, patientId })
      : null;
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }
    if (!OPEN_APPOINTMENT_STATUSES.includes(appointment.status)) {
      throw new BadRequestException(
        '"This visit" needs an upcoming appointment — choose 30 days or until revoked instead',
      );
    }
    if (!org.providerId || !appointment.providerId.equals(org.providerId)) {
      throw new BadRequestException(
        'That appointment is not with this partner',
      );
    }
    const slot = await this.slotModel.findById(appointment.slotId);
    if (!slot) {
      throw new BadRequestException('The appointment has no scheduled time');
    }
    const visitAt = slotStart(slot.date, slot.time);
    const expiresAt = new Date(visitAt.getTime() + VISIT_GRACE_MS);
    if (expiresAt <= new Date()) {
      throw new BadRequestException('That visit has already passed');
    }
    return { appointmentId: appointment._id, expiresAt };
  }

  private async notifyConsentEvent(
    userId: string,
    grant: ShareGrantDocument,
    event: 'granted' | 'revoked',
    scopeLabel: string,
  ): Promise<void> {
    const granted = event === 'granted';
    await this.notifications
      .create(userId, {
        trigger: granted ? 'access_granted' : 'access_revoked',
        category: 'consent',
        title: granted ? 'Access granted' : 'Access revoked',
        message: granted
          ? `${grant.organisationName} can view: ${scopeLabel}${grant.expiresAt ? ` until ${grant.expiresAt.toISOString().slice(0, 10)}` : ''}`
          : `${grant.organisationName} can no longer view your records`,
        lockScreenText: granted ? 'Record access granted' : 'Record access revoked',
        actionLabel: 'View sharing',
        actionRoute: '/sharing',
      })
      .catch((err: unknown) =>
        this.logger.error(`Failed to post consent notification for grant ${grant.id}`, err as Error),
      );
  }

  private async getOwnedGrantOrThrow(userId: string, id: string): Promise<ShareGrantDocument> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Grant not found');
    const grant = await this.grantModel.findOne({ _id: id, userId: new Types.ObjectId(userId) });
    if (!grant) throw new NotFoundException('Grant not found');
    return grant;
  }

  private toGrantResponse(g: ShareGrantDocument): ShareGrantResponseDto {
    // Expiry is lazy: the stored status stays "active", so derive it here —
    // the same rule the partner side applies when it reads.
    const status =
      g.status === 'active' && g.expiresAt && g.expiresAt <= new Date()
        ? 'expired'
        : g.status;
    return {
      id: g.id,
      organisationId: g.organisationId,
      organisationName: g.organisationName,
      scopeKind: g.scopeKind,
      scopeLabel: describeScope(g),
      recordIds: g.recordIds,
      recordTitles: g.recordTitles,
      recordTypes: g.recordTypes ?? [],
      rollingMonths: g.rollingMonths,
      purpose: g.purpose,
      duration: g.duration,
      appointmentId: g.appointmentId?.toString(),
      status,
      grantedAt: (g.grantedAt ?? new Date()).toISOString(),
      expiresAt: g.expiresAt?.toISOString(),
      revokedAt: g.revokedAt?.toISOString(),
      accessCount: g.accessCount,
      lastAccessedAt: g.lastAccessedAt?.toISOString(),
    };
  }
}

/** Slot date is stored at UTC midnight; time is "HH:mm" on that day. */
function slotStart(date: Date, time: string): Date {
  const [h, m] = time.split(':').map((n) => parseInt(n, 10));
  const start = new Date(date);
  start.setUTCHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);
  return start;
}
