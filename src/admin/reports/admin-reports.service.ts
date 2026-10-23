import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter, Types } from 'mongoose';
import {
  MedicalRecord,
  MedicalRecordDocument,
  MedicalRecordType,
  consentStatusOf,
} from '../../core/records/schemas/medical-record.schema';
import {
  ExtractionMethod,
  ReportInterpretation,
  ReportInterpretationDocument,
  ReportAiStatus,
  ReportReleaseStatus,
} from '../../ai/report-interpreter/schemas/report-interpretation.schema';
import { User, UserDocument } from '../../core/users/schemas/user.schema';
import { StorageService } from '../../storage/storage.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import { QueryAdminReportsDto } from './dto/query-admin-reports.dto';
import {
  AdminReportResponseDto,
  ProcessingMethod,
} from './dto/admin-report-response.dto';

// MedicalRecord has no stored mimetype (TRD data model) — infer a reasonable
// Content-Type from its category for the raw-file endpoint, defaulting to a
// generic binary stream rather than inventing an OCR/mimetype-detection pipeline.
const CONTENT_TYPE_BY_RECORD_TYPE: Partial<Record<MedicalRecordType, string>> =
  {
    [MedicalRecordType.SCAN]: 'image/jpeg',
  };
const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

/**
 * How the values in a report were extracted: confirmed by a clinician beats
 * everything; otherwise the extraction that produced the summary. No
 * interpretation yet means nothing has been extracted.
 */
export function processingMethodOf(
  interpretation?: Pick<ReportInterpretation, 'verifiedAt' | 'extractionMethod'> | null,
): ProcessingMethod | null {
  if (!interpretation) return null;
  if (interpretation.verifiedAt) return 'md_verified';
  return interpretation.extractionMethod === ExtractionMethod.OCR_EXTRACTED
    ? 'ocr_extracted'
    : 'ai_parsed';
}

@Injectable()
export class AdminReportsService {
  constructor(
    @InjectModel(MedicalRecord.name)
    private readonly medicalRecordModel: Model<MedicalRecordDocument>,
    @InjectModel(ReportInterpretation.name)
    private readonly reportInterpretationModel: Model<ReportInterpretationDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly storageService: StorageService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async findAll(
    query: QueryAdminReportsDto,
  ): Promise<AdminReportResponseDto[]> {
    const filter: QueryFilter<MedicalRecordDocument> = query.type
      ? { type: query.type }
      : {};

    const records = await this.medicalRecordModel
      .find(filter)
      .sort({ uploadedAt: -1 })
      .exec();
    if (records.length === 0) return [];

    // ReportInterpretation is Phase-3-owned and may be entirely empty right now —
    // a record with no matching doc is honestly reported as "queued", not omitted.
    const [interpretations, patients] = await Promise.all([
      this.reportInterpretationModel
        .find({ recordId: { $in: records.map((r) => r._id) } })
        .exec(),
      this.userModel
        .find({ _id: { $in: records.map((r) => r.patientId) } })
        .exec(),
    ]);
    const interpretationByRecordId = new Map(
      interpretations.map((i) => [i.recordId.toString(), i]),
    );
    const patientById = new Map(patients.map((p) => [p.id, p]));

    const results = records.map((r) =>
      this.toResponse(
        r,
        interpretationByRecordId.get(r.id),
        patientById.get(r.patientId.toString()),
      ),
    );

    return query.status
      ? results.filter((r) => r.aiStatus === query.status)
      : results;
  }

  async findOne(id: string): Promise<AdminReportResponseDto> {
    const record = await this.getRecordOrThrow(id);
    const [interpretation, patient] = await Promise.all([
      this.reportInterpretationModel.findOne({ recordId: record._id }).exec(),
      this.userModel.findById(record.patientId).exec(),
    ]);
    return this.toResponse(record, interpretation ?? undefined, patient ?? undefined);
  }

  /** The decrypted source file — refused while the record has no consent token. */
  async getFile(
    id: string,
    actorId: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const record = await this.getRecordOrThrow(id);
    const patient = await this.userModel.findById(record.patientId).select('consent').lean().exec();
    const consent = consentStatusOf(record, patient?.consent);
    if (consent.status !== 'verified') {
      await this.auditLogService.record({
        actorId,
        action: AuditAction.RECORD_ACCESS_BLOCKED,
        targetType: 'MedicalRecord',
        targetId: record.id,
        metadata: { attempted: 'view_file', reason: consent.detail },
      });
      throw new ForbiddenException(`This record is locked: ${consent.detail.toLowerCase()}.`);
    }

    const buffer = await this.storageService.read(record.fileRef);
    const contentType =
      record.mimeType ?? CONTENT_TYPE_BY_RECORD_TYPE[record.type] ?? DEFAULT_CONTENT_TYPE;

    return { buffer, contentType };
  }

  private toResponse(
    record: MedicalRecordDocument,
    interpretation?: ReportInterpretationDocument,
    patient?: UserDocument,
  ): AdminReportResponseDto {
    return {
      id: record.id,
      patientId: record.patientId.toString(),
      patientName: patient?.fullName ?? 'Unknown patient',
      type: record.type,
      uploadedAt: (record.uploadedAt ?? new Date(0)).toISOString(),
      aiStatus: interpretation?.aiStatus ?? ReportAiStatus.QUEUED,
      summaryText: interpretation?.summaryText,
      processingMethod: processingMethodOf(interpretation),
      verifiedBy: interpretation?.verifiedBy,
      verifiedAt: interpretation?.verifiedAt?.toISOString(),
      releaseStatus: interpretation
        ? (interpretation.releaseStatus ?? ReportReleaseStatus.RELEASED)
        : undefined,
      promptVersion: interpretation?.promptVersion,
    };
  }

  private async getRecordOrThrow(id: string): Promise<MedicalRecordDocument> {
    const record = Types.ObjectId.isValid(id)
      ? await this.medicalRecordModel.findById(id).exec()
      : null;
    if (!record) {
      throw new NotFoundException('Report not found');
    }
    return record;
  }
}
