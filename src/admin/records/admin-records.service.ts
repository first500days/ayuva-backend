import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter, Types } from 'mongoose';
import {
  MedicalRecord,
  MedicalRecordDocument,
  RecordStatusEnhanced,
  consentStatusOf,
  recordSystemFileName,
} from '../../core/records/schemas/medical-record.schema';
import { User, UserDocument } from '../../core/users/schemas/user.schema';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import { QueryAdminRecordsDto } from './dto/query-admin-records.dto';
import { AdminRecordResponseDto } from './dto/admin-record-response.dto';
import { buildSafeRegex } from '../../common/utils/regex.util';
import { displayIp } from '../../common/request-context/client-ip';
import {
  AccessLog,
  AccessLogDocument,
} from '../../core/sharing/schemas/access-log.schema';

@Injectable()
export class AdminRecordsService {
  constructor(
    @InjectModel(MedicalRecord.name)
    private readonly medicalRecordModel: Model<MedicalRecordDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(AccessLog.name)
    private readonly accessLogModel: Model<AccessLogDocument>,
    private readonly auditLogService: AuditLogService,
  ) {}

  async findAll(query: QueryAdminRecordsDto): Promise<AdminRecordResponseDto[]> {
    const and: QueryFilter<MedicalRecordDocument>[] = [];

    if (query.search) {
      // System file name, patient name or record id — never the device filename.
      const re = buildSafeRegex(query.search);
      const patients = await this.userModel.find({ fullName: re }).select('_id').lean().exec();
      and.push({
        $or: [
          { systemFileName: re },
          { patientId: { $in: patients.map((p) => p._id) } },
          ...(Types.ObjectId.isValid(query.search.trim())
            ? [{ _id: new Types.ObjectId(query.search.trim()) }]
            : []),
        ],
      });
    }
    if (query.type) and.push({ type: query.type });
    if (query.status) and.push({ status: query.status });

    const filter = and.length > 0 ? { $and: and } : {};

    const records = await this.medicalRecordModel
      .find(filter)
      .sort({ uploadedAt: -1 })
      .exec();

    if (records.length === 0) return [];

    const patientIds = [...new Set(records.map((r) => r.patientId))];
    const patients = await this.userModel
      .find({ _id: { $in: patientIds } })
      .select('fullName consent')
      .exec();
    const patientById = new Map(patients.map((p) => [p.id, p]));

    return records.map((r) => this.toResponse(r, patientById.get(r.patientId.toString())));
  }

  async findOne(id: string): Promise<AdminRecordResponseDto> {
    const record = await this.getRecordOrThrow(id);
    const patient = await this.userModel.findById(record.patientId).select('fullName consent').exec();
    return this.toResponse(record, patient ?? undefined);
  }

  /**
   * Refuses work on a record with no valid consent token ("locked"), and
   * leaves an audit entry naming who tried.
   */
  async assertUnlocked(record: MedicalRecordDocument, actorId: string, attempted: string): Promise<void> {
    const patient = await this.userModel.findById(record.patientId).select('consent').lean().exec();
    const consent = consentStatusOf(record, patient?.consent);
    if (consent.status === 'verified') return;
    await this.auditLogService.record({
      actorId,
      action: AuditAction.RECORD_ACCESS_BLOCKED,
      targetType: 'MedicalRecord',
      targetId: record.id,
      metadata: { attempted, reason: consent.detail },
    });
    throw new ForbiddenException(`This record is locked: ${consent.detail.toLowerCase()}.`);
  }

  private toResponse(
    record: MedicalRecordDocument,
    patient?: Pick<UserDocument, 'fullName' | 'consent'>,
  ): AdminRecordResponseDto {
    const consent = consentStatusOf(record, patient?.consent);
    return {
      id: record.id,
      patientId: record.patientId.toString(),
      patientName: patient?.fullName ?? 'Unknown patient',
      type: record.type,
      // The sanitized system name; the device filename never leaves the patient's vault.
      fileName: recordSystemFileName(record),
      uploadedAt: (record.uploadedAt ?? new Date(0)).toISOString(),
      status: record.status ?? RecordStatusEnhanced.UPLOADED,
      aiStatus: record.aiStatus,
      consent: {
        status: consent.status,
        source: consent.source,
        detail: consent.detail,
        tokenId: consent.token?.tokenId,
        version: consent.token?.version,
        acceptedAt: consent.token?.acceptedAt?.toISOString(),
        capturedAt: consent.token?.capturedAt?.toISOString(),
      },
      locked: consent.status !== 'verified',
    };
  }

  private async getRecordOrThrow(id: string): Promise<MedicalRecordDocument> {
    const record = Types.ObjectId.isValid(id)
      ? await this.medicalRecordModel.findById(id).exec()
      : null;
    if (!record) throw new NotFoundException('Record not found');
    return record;
  }

  async getConsents() {
    return [
      {
        id: 'CON-901',
        patientName: 'Rahul Sharma',
        patientId: 'usr_rahul_01',
        recipientName: 'Dr. Arvind Menon (Cardiologist)',
        hospitalName: 'Apollo Spectra Hospital',
        purpose: 'Clinical Consultation & ECG Review',
        scope: ['ECG Reports', 'Lipid Panel', 'Past Prescription (2025-2026)'],
        grantedAt: '2026-08-18T10:30:00Z',
        expiresAt: '2026-09-18T10:30:00Z',
        status: 'active',
      },
      {
        id: 'CON-902',
        patientName: 'Ananya Iyer',
        patientId: 'usr_ananya_02',
        recipientName: 'Dr. Priya Desai (Endocrinologist)',
        hospitalName: 'Manipal Hospital - Old Airport Road',
        purpose: 'Thyroid Treatment Monitoring',
        scope: ['Thyroid Function Test', 'HbA1c Lab Report'],
        grantedAt: '2026-08-15T14:20:00Z',
        expiresAt: '2026-08-22T14:20:00Z',
        status: 'active',
      },
      {
        id: 'CON-903',
        patientName: 'Karan Malhotra',
        patientId: 'usr_karan_03',
        recipientName: 'Fortis Health Checkup Desk',
        hospitalName: 'Fortis Hospital - Bannerghatta',
        purpose: 'Annual Comprehensive Executive Checkup',
        scope: ['All Lab Records', 'Imaging Scans'],
        grantedAt: '2026-08-01T09:00:00Z',
        expiresAt: '2026-08-15T09:00:00Z',
        status: 'revoked',
        revokedAt: '2026-08-12T16:45:00Z',
        revocationReason: 'Patient requested access cutoff after consultation completion',
      },
    ];
  }

  /**
   * Record access audit: partner staff opening, downloading or being granted a
   * patient's records, newest first, with the viewer's public address (rows
   * written before addresses were captured show "Not recorded").
   */
  async getAccessLogs() {
    const rows = await this.accessLogModel
      .find({ action: { $in: ['viewed', 'downloaded', 'granted', 'revoked', 'expired'] } })
      .sort({ occurredAt: -1 })
      .limit(200)
      .lean()
      .exec();
    const patientIds = [...new Set(rows.map((r) => String(r.userId)))];
    const patients = await this.userModel
      .find({ _id: { $in: patientIds.map((id) => new Types.ObjectId(id)) } })
      .select('fullName')
      .lean()
      .exec();
    const nameOf = new Map(patients.map((u) => [String(u._id), u.fullName ?? 'Patient']));
    const ACTION: Record<string, string> = {
      viewed: 'Opened under the patient’s share',
      downloaded: 'Downloaded under the patient’s share',
      granted: 'Share granted by the patient',
      revoked: 'Share revoked by the patient',
      expired: 'Share expired',
    };
    return rows.map((r) => ({
      id: String(r._id),
      recordId: r.grantId,
      recordName: r.recordTitle,
      patientName: nameOf.get(String(r.userId)) ?? 'Patient',
      accessorName: r.viewerName ?? r.organisationName,
      accessorRole: r.organisationName,
      purpose: ACTION[r.action] ?? r.action,
      ipAddress: displayIp(r.ipAddress) ?? 'Not recorded',
      accessedAt: r.occurredAt ? new Date(r.occurredAt).toISOString() : null,
      authStatus: 'authorized',
    }));
  }

  async archive(id: string) {
    const record = await this.medicalRecordModel.findById(id).exec();
    if (!record) throw new NotFoundException('Record not found');
    record.status = RecordStatusEnhanced.ARCHIVED;
    await record.save();
    return this.findOne(id);
  }

  async reprocess(id: string, actorId: string) {
    const record = await this.getRecordOrThrow(id);
    // Reprocessing runs OCR/AI on the document, which needs the patient's consent.
    await this.assertUnlocked(record, actorId, 'reprocess');
    record.status = RecordStatusEnhanced.PROCESSING;
    await record.save();
    return this.findOne(id);
  }
}
