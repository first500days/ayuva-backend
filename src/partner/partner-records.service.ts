import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ShareGrant, ShareGrantDocument } from '../core/sharing/schemas/share-grant.schema';
import {
  ShareOrganisation,
  ShareOrganisationDocument,
} from '../core/sharing/schemas/share-organisation.schema';
import { AccessLog, AccessLogDocument } from '../core/sharing/schemas/access-log.schema';
import {
  MedicalRecord,
  MedicalRecordDocument,
} from '../core/records/schemas/medical-record.schema';
import { User, UserDocument } from '../core/users/schemas/user.schema';
import {
  AppointmentDocument,
} from '../core/appointments/schemas/appointment.schema';
import { AppointmentSlotDocument } from '../core/providers/schemas/appointment-slot.schema';
import { StorageService } from '../storage/storage.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../audit-log/schemas/audit-log.schema';
import { PartnerContextService } from './partner-context.service';

/**
 * P04 — Report Vault sharing from the partner side. A partner only ever sees
 * records the patient explicitly granted (active, unexpired, unrevoked), and
 * every view/download is logged against the authenticated partner.
 */
@Injectable()
export class PartnerRecordsService {
  constructor(
    @InjectModel(ShareGrant.name) private readonly grantModel: Model<ShareGrantDocument>,
    @InjectModel(ShareOrganisation.name) private readonly orgModel: Model<ShareOrganisationDocument>,
    @InjectModel(AccessLog.name) private readonly logModel: Model<AccessLogDocument>,
    @InjectModel(MedicalRecord.name) private readonly recordModel: Model<MedicalRecordDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly storage: StorageService,
    private readonly audit: AuditLogService,
    private readonly context: PartnerContextService,
  ) {}

  async listShares(userId: string) {
    const provider = await this.context.requireLive(userId);
    const grants = await this.activeGrants(provider.id);
    return this.toShares(grants);
  }

  async recentShares(providerId: string, limit: number) {
    const grants = await this.activeGrants(providerId, limit);
    return this.toShares(grants);
  }

  async getShare(userId: string, grantId: string) {
    const provider = await this.context.requireLive(userId);
    const grant = await this.getActiveGrantOrThrow(provider.id, grantId);
    const partner = await this.userModel.findById(userId).select('fullName').exec();

    const records = await this.recordModel
      .find({ _id: { $in: grant.recordIds.filter((id) => Types.ObjectId.isValid(id)) } })
      .exec();

    grant.accessCount += 1;
    grant.lastAccessedAt = new Date();
    await grant.save();
    await this.logModel.create({
      userId: grant.userId,
      grantId: grant.id,
      organisationName: grant.organisationName,
      recordTitle: `${records.length} record(s)`,
      action: 'viewed',
      viewerUserId: new Types.ObjectId(userId),
      viewerName: partner?.fullName,
    });

    const [share] = await this.toShares([grant]);
    return {
      ...share,
      records: records.map((r) => ({
        id: r.id,
        title: r.originalFileName,
        type: r.type,
        uploadedAt: r.uploadedAt?.toISOString(),
      })),
    };
  }

  /** Decrypts and returns one granted record file; logged as a download. */
  async downloadRecord(userId: string, grantId: string, recordId: string) {
    const provider = await this.context.requireLive(userId);
    const grant = await this.getActiveGrantOrThrow(provider.id, grantId);
    if (!grant.recordIds.includes(recordId) || !Types.ObjectId.isValid(recordId)) {
      throw new ForbiddenException('This record was not shared with you');
    }
    const record = await this.recordModel.findById(recordId);
    if (!record) throw new NotFoundException('Record not found');
    const partner = await this.userModel.findById(userId).select('fullName').exec();

    const buffer = await this.storage.read(record.fileRef);
    await this.logModel.create({
      userId: grant.userId,
      grantId: grant.id,
      organisationName: grant.organisationName,
      recordTitle: record.originalFileName,
      action: 'downloaded',
      viewerUserId: new Types.ObjectId(userId),
      viewerName: partner?.fullName,
    });
    await this.audit.record({
      actorId: userId,
      action: AuditAction.PARTNER_RECORD_VIEW,
      targetType: 'MedicalRecord',
      targetId: recordId,
      metadata: { grantId, download: true },
    });
    return { buffer, fileName: record.originalFileName };
  }

  /** Access log: every view attributable to a partner login on this provider's organisations. */
  async accessLog(userId: string) {
    const provider = await this.context.requireLive(userId);
    const orgIds = await this.orgIds(provider.id);
    const grants = await this.grantModel
      .find({ organisationId: { $in: orgIds } })
      .select('_id')
      .exec();
    const logs = await this.logModel
      .find({ grantId: { $in: grants.map((g) => g.id) }, viewerUserId: { $exists: true } })
      .sort({ occurredAt: -1 })
      .limit(200)
      .exec();
    return logs.map((l) => ({
      id: l.id,
      grantId: l.grantId,
      recordTitle: l.recordTitle,
      action: l.action,
      viewerName: l.viewerName,
      viewerUserId: l.viewerUserId?.toString(),
      occurredAt: (l.occurredAt ?? new Date()).toISOString(),
    }));
  }

  /** Shape appointments for partner screens (patient name + count of records they shared). */
  async describeAppointments(
    appointments: AppointmentDocument[],
    slotById: Map<string, AppointmentSlotDocument>,
  ) {
    if (appointments.length === 0) return [];
    const patientIds = [...new Set(appointments.map((a) => a.patientId.toString()))];
    const providerId = appointments[0].providerId.toString();
    const [patients, orgIds] = await Promise.all([
      this.userModel.find({ _id: { $in: patientIds } }).select('fullName').exec(),
      this.orgIds(providerId),
    ]);
    const patientById = new Map(patients.map((p) => [p.id, p.fullName]));
    const grants = await this.grantModel
      .find({
        organisationId: { $in: orgIds },
        userId: { $in: patientIds.map((id) => new Types.ObjectId(id)) },
        status: 'active',
      })
      .exec();
    const sharedByPatient = new Map<string, number>();
    for (const g of grants) {
      if (g.expiresAt && g.expiresAt < new Date()) continue;
      const key = g.userId.toString();
      sharedByPatient.set(key, (sharedByPatient.get(key) ?? 0) + g.recordIds.length);
    }

    return appointments.map((a) => {
      const slot = slotById.get(a.slotId.toString());
      return {
        id: a.id,
        patientId: a.patientId.toString(),
        patientName: patientById.get(a.patientId.toString()) ?? 'Patient',
        date: slot ? slot.date.toISOString().slice(0, 10) : '',
        time: slot?.time ?? '',
        durationMin: slot?.durationMin,
        status: a.status,
        paymentStatus: a.paymentStatus,
        followUpOfId: a.followUpOfId?.toString(),
        rejectionReason: a.rejectionReason,
        sharedRecordCount: sharedByPatient.get(a.patientId.toString()) ?? 0,
      };
    });
  }

  private async orgIds(providerId: string): Promise<string[]> {
    const orgs = await this.orgModel
      .find({ providerId: new Types.ObjectId(providerId) })
      .select('_id')
      .exec();
    return orgs.map((o) => o.id);
  }

  private async activeGrants(providerId: string, limit = 100) {
    const orgIds = await this.orgIds(providerId);
    return this.grantModel
      .find({
        organisationId: { $in: orgIds },
        status: 'active',
        $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: new Date() } }],
      })
      .sort({ grantedAt: -1 })
      .limit(limit)
      .exec();
  }

  private async getActiveGrantOrThrow(providerId: string, grantId: string) {
    if (!Types.ObjectId.isValid(grantId)) throw new NotFoundException('Share not found');
    const grants = await this.activeGrants(providerId, 500);
    const grant = grants.find((g) => g.id === grantId);
    if (!grant) throw new NotFoundException('Share not found or no longer active');
    return grant;
  }

  private async toShares(grants: ShareGrantDocument[]) {
    const users = await this.userModel
      .find({ _id: { $in: grants.map((g) => g.userId) } })
      .select('fullName')
      .exec();
    const nameById = new Map(users.map((u) => [u.id, u.fullName]));
    return grants.map((g) => ({
      id: g.id,
      patientId: g.userId.toString(),
      patientName: nameById.get(g.userId.toString()) ?? 'Patient',
      scopeKind: g.scopeKind,
      purpose: g.purpose,
      recordCount: g.recordIds.length,
      grantedAt: (g.grantedAt ?? new Date()).toISOString(),
      expiresAt: g.expiresAt?.toISOString(),
      accessCount: g.accessCount,
      lastAccessedAt: g.lastAccessedAt?.toISOString(),
    }));
  }
}
