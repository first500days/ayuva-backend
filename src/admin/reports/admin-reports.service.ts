import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter, Types } from 'mongoose';
import {
  MedicalRecord,
  MedicalRecordDocument,
  MedicalRecordType,
} from '../../core/records/schemas/medical-record.schema';
import {
  ReportInterpretation,
  ReportInterpretationDocument,
  ReportAiStatus,
} from '../../ai/report-interpreter/schemas/report-interpretation.schema';
import { User, UserDocument } from '../../core/users/schemas/user.schema';
import { StorageService } from '../../storage/storage.service';
import { QueryAdminReportsDto } from './dto/query-admin-reports.dto';
import { AdminReportResponseDto } from './dto/admin-report-response.dto';

// MedicalRecord has no stored mimetype (TRD data model) — infer a reasonable
// Content-Type from its category for the raw-file endpoint, defaulting to a
// generic binary stream rather than inventing an OCR/mimetype-detection pipeline.
const CONTENT_TYPE_BY_RECORD_TYPE: Partial<Record<MedicalRecordType, string>> =
  {
    [MedicalRecordType.IMAGING]: 'image/jpeg',
  };
const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

@Injectable()
export class AdminReportsService {
  constructor(
    @InjectModel(MedicalRecord.name)
    private readonly medicalRecordModel: Model<MedicalRecordDocument>,
    @InjectModel(ReportInterpretation.name)
    private readonly reportInterpretationModel: Model<ReportInterpretationDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly storageService: StorageService,
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

    const results = records.map((r) => {
      const interpretation = interpretationByRecordId.get(r.id);
      const patient = patientById.get(r.patientId.toString());
      return {
        id: r.id,
        patientId: r.patientId.toString(),
        patientName: patient?.fullName ?? 'Unknown patient',
        type: r.type,
        uploadedAt: (r.uploadedAt ?? new Date(0)).toISOString(),
        aiStatus: interpretation?.aiStatus ?? ReportAiStatus.QUEUED,
        summaryText: interpretation?.summaryText,
      };
    });

    return query.status
      ? results.filter((r) => r.aiStatus === query.status)
      : results;
  }

  async findOne(id: string): Promise<AdminReportResponseDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Report not found');
    }
    const record = await this.medicalRecordModel.findById(id).exec();
    if (!record) {
      throw new NotFoundException('Report not found');
    }

    const [interpretation, patient] = await Promise.all([
      this.reportInterpretationModel.findOne({ recordId: record._id }).exec(),
      this.userModel.findById(record.patientId).exec(),
    ]);

    return {
      id: record.id,
      patientId: record.patientId.toString(),
      patientName: patient?.fullName ?? 'Unknown patient',
      type: record.type,
      uploadedAt: (record.uploadedAt ?? new Date(0)).toISOString(),
      aiStatus: interpretation?.aiStatus ?? ReportAiStatus.QUEUED,
      summaryText: interpretation?.summaryText,
    };
  }

  async getFile(id: string): Promise<{ buffer: Buffer; contentType: string }> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Report not found');
    }
    const record = await this.medicalRecordModel.findById(id).exec();
    if (!record) {
      throw new NotFoundException('Report not found');
    }

    const buffer = await this.storageService.read(record.fileRef);
    const contentType =
      CONTENT_TYPE_BY_RECORD_TYPE[record.type] ?? DEFAULT_CONTENT_TYPE;

    return { buffer, contentType };
  }
}
