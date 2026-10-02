import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter, Types } from 'mongoose';
import {
  MedicalRecord,
  MedicalRecordDocument,
  MedicalRecordKind,
  MedicalRecordType,
} from './schemas/medical-record.schema';
import {
  Appointment,
  AppointmentDocument,
} from '../appointments/schemas/appointment.schema';
import {
  ReportInterpretation,
  ReportInterpretationDocument,
  ReportAiStatus,
} from '../../ai/report-interpreter/schemas/report-interpretation.schema';
import { StorageService } from '../../storage/storage.service';
import { ReminderQueueService } from '../../notifications/queue/reminder-queue.service';
import { MedicalRecordResponseDto } from './dto/medical-record-response.dto';
import { MedicalRecordDetailResponseDto } from './dto/medical-record-detail-response.dto';
import { UploadRecordDto } from './dto/upload-record.dto';
import { UpdateRecordDto } from './dto/update-record.dto';
import { QueryRecordsDto } from './dto/query-records.dto';
import { buildSafeRegex } from '../../common/utils/regex.util';

export const ALLOWED_RECORD_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/webp',
];

// Priority-ordered filename heuristics. Phase 3 replaces this with real
// OCR/AI-assisted classification (PRD FR-8.3) — this rule-based pass is the
// permanent fallback/first-pass, not a placeholder to be deleted outright.
const CATEGORY_PATTERNS: Array<[RegExp, MedicalRecordType]> = [
  [/discharge|summary/i, MedicalRecordType.DISCHARGE],
  [
    /\b(rx|prescription|medication|pharmacy)\b/i,
    MedicalRecordType.PRESCRIPTION,
  ],
  [/vaccin|immuni[sz]ation|booster/i, MedicalRecordType.VACCINATION],
  [/insurance|policy|claim|tpa/i, MedicalRecordType.INSURANCE],
  [/certificate|fitness|sick[-_ ]?leave/i, MedicalRecordType.CERTIFICATE],
  [
    /blood|cbc|lipid|glucose|hba1c|panel|h(a)?ematology|ecg|ekg/i,
    MedicalRecordType.LAB_REPORT,
  ],
  [
    /x-?ray|mri|ct[-_ ]?scan|ultrasound|echo|scan|imaging|radiology/i,
    MedicalRecordType.SCAN,
  ],
];

@Injectable()
export class RecordsService {
  constructor(
    @InjectModel(MedicalRecord.name)
    private readonly recordModel: Model<MedicalRecordDocument>,
    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,
    @InjectModel(ReportInterpretation.name)
    private readonly reportInterpretationModel: Model<ReportInterpretationDocument>,
    private readonly storageService: StorageService,
    private readonly reminderQueueService: ReminderQueueService,
  ) {}

  async upload(
    userId: string,
    file: Express.Multer.File | undefined,
    options: UploadRecordDto = {},
  ): Promise<MedicalRecordResponseDto> {
    if (!file) {
      throw new BadRequestException('A file is required');
    }
    if (!ALLOWED_RECORD_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type "${file.mimetype}" — allowed: ${ALLOWED_RECORD_MIME_TYPES.join(', ')}`,
      );
    }

    const kind = options.kind ?? MedicalRecordKind.ORIGINAL;
    const source = options.derivedFromRecordId
      ? await this.getOwnedRecordOrThrow(userId, options.derivedFromRecordId)
      : undefined;
    if (kind === MedicalRecordKind.SIMPLIFICATION && !source) {
      throw new BadRequestException(
        'A simplification must name the record it explains (derivedFromRecordId)',
      );
    }
    if (options.appointmentId) {
      await this.getOwnedAppointmentOrThrow(userId, options.appointmentId);
    }

    // A saved explanation lives in its source's folder, next to it.
    const type =
      options.type ??
      source?.type ??
      (kind === MedicalRecordKind.VISIT_SUMMARY
        ? MedicalRecordType.PRESCRIPTION
        : this.categorize(file.originalname, file.mimetype));
    const fileRef = await this.storageService.upload(
      file.buffer,
      file.originalname,
      userId,
    );

    const record = await this.recordModel.create({
      patientId: userId,
      fileRef,
      originalFileName: file.originalname,
      mimeType: file.mimetype,
      type,
      kind,
      tags: options.tags ?? [],
      ...(source && { derivedFromRecordId: source._id }),
      ...(options.appointmentId && {
        attachedAppointmentId: new Types.ObjectId(options.appointmentId),
      }),
      ...((options.providerName ?? source?.providerName) && {
        providerName: options.providerName ?? source?.providerName,
      }),
      ...((options.recordDate || source?.recordDate) && {
        recordDate: options.recordDate
          ? new Date(options.recordDate)
          : source?.recordDate,
      }),
    });

    await this.reminderQueueService.sendDocumentUploadConfirmation({
      recordId: record.id,
      userId,
      fileName: record.originalFileName,
    });

    return this.toResponse(record);
  }

  /** U08 vault listing: folder, free-text (name/tag/provider), tag, kind and clinical-date filters. */
  async findAll(
    userId: string,
    filters: QueryRecordsDto = {},
  ): Promise<MedicalRecordResponseDto[]> {
    const and: QueryFilter<MedicalRecordDocument>[] = [
      { patientId: new Types.ObjectId(userId) },
    ];
    if (filters.type) {
      and.push({
        type: filters.type,
        kind: { $ne: MedicalRecordKind.VISIT_SUMMARY },
      });
    }
    if (filters.kind) {
      // Records from before `kind` existed are originals.
      and.push(
        filters.kind === MedicalRecordKind.ORIGINAL
          ? { kind: { $in: [MedicalRecordKind.ORIGINAL, null] } }
          : { kind: filters.kind },
      );
    }
    if (filters.tag) {
      and.push({ tags: filters.tag.trim().toLowerCase() });
    }
    if (filters.q) {
      const re = buildSafeRegex(filters.q);
      and.push({
        $or: [{ originalFileName: re }, { tags: re }, { providerName: re }],
      });
    }
    if (filters.from || filters.to) {
      const range: { $gte?: Date; $lte?: Date } = {};
      if (filters.from) range.$gte = startOfDay(filters.from);
      if (filters.to) range.$lte = endOfDay(filters.to);
      // Clinical date when known, upload date otherwise — the same fallback the timeline uses.
      and.push({
        $or: [
          { recordDate: range },
          { recordDate: { $exists: false }, uploadedAt: range },
        ],
      });
    }

    const records = await this.recordModel
      .find(and.length > 1 ? { $and: and } : and[0])
      .sort({ uploadedAt: -1 })
      .exec();
    return records
      .map((r) => this.toResponse(r))
      .sort((a, b) => b.recordDate.localeCompare(a.recordDate));
  }

  /** U08 row menu: rename, move folder, tags, provider, clinical date. */
  async update(
    userId: string,
    id: string,
    dto: UpdateRecordDto,
  ): Promise<MedicalRecordResponseDto> {
    const record = await this.getOwnedRecordOrThrow(userId, id);
    if (dto.title !== undefined) record.originalFileName = dto.title.trim();
    if (dto.type !== undefined) record.type = dto.type;
    if (dto.tags !== undefined) record.tags = dto.tags;
    if (dto.providerName !== undefined) {
      record.providerName = dto.providerName.trim() || undefined;
    }
    if (dto.recordDate !== undefined) record.recordDate = new Date(dto.recordDate);
    await record.save();
    return this.toResponse(record);
  }

  /**
   * Deletes the record and its file. Share grants are not rewritten: partner
   * reads resolve records live, so a deleted record simply stops appearing.
   * Saved explanations of it stay — they are the patient's own documents —
   * but lose their source link.
   */
  async remove(userId: string, id: string): Promise<void> {
    const record = await this.getOwnedRecordOrThrow(userId, id);
    await this.recordModel.deleteOne({ _id: record._id });
    await this.recordModel.updateMany(
      { derivedFromRecordId: record._id },
      { $unset: { derivedFromRecordId: '' } },
    );
    await this.storageService.remove(record.fileRef);
  }

  /** The decrypted file, for the patient's own download/share (U08). */
  async download(
    userId: string,
    id: string,
  ): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
    const record = await this.getOwnedRecordOrThrow(userId, id);
    const buffer = await this.storageService.read(record.fileRef);
    return {
      buffer,
      fileName: record.originalFileName,
      mimeType: record.mimeType ?? guessMimeType(record.originalFileName),
    };
  }

  async findOne(
    userId: string,
    id: string,
  ): Promise<MedicalRecordDetailResponseDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Record not found');
    }

    const record = await this.recordModel.findOne({
      _id: id,
      patientId: new Types.ObjectId(userId),
    });
    if (!record) {
      throw new NotFoundException('Record not found');
    }

    // ReportInterpretation is Phase-3-owned and may not exist yet — a record with
    // no matching doc is honestly reported as "queued", not a 404 or a fake status.
    const interpretation = await this.reportInterpretationModel
      .findOne({ recordId: record._id })
      .exec();

    return {
      ...this.toResponse(record),
      aiStatus: interpretation?.aiStatus ?? ReportAiStatus.QUEUED,
      summaryText: interpretation?.summaryText,
    };
  }

  async attachToAppointment(
    userId: string,
    recordId: string,
    appointmentId: string,
  ): Promise<MedicalRecordResponseDto> {
    if (!Types.ObjectId.isValid(recordId) || !Types.ObjectId.isValid(appointmentId)) {
      throw new NotFoundException('Record or appointment not found');
    }

    const record = await this.recordModel.findOne({
      _id: recordId,
      patientId: new Types.ObjectId(userId),
    });
    if (!record) {
      throw new NotFoundException('Record not found');
    }

    const appointment = await this.appointmentModel.findOne({
      _id: appointmentId,
      patientId: new Types.ObjectId(userId),
    });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    record.attachedAppointmentId = new Types.ObjectId(appointmentId);
    await record.save();

    return this.toResponse(record);
  }

  private categorize(filename: string, mimetype: string): MedicalRecordType {
    for (const [pattern, type] of CATEGORY_PATTERNS) {
      if (pattern.test(filename)) return type;
    }
    if (mimetype.startsWith('image/')) {
      // Photo/scan capture with no recognisable filename hint (FR-8.1) — the scans folder is the safest default.
      return MedicalRecordType.SCAN;
    }
    // Generic scanned/typed document with no other signal — most common real-world catch-all.
    return MedicalRecordType.PRESCRIPTION;
  }

  private async getOwnedRecordOrThrow(
    userId: string,
    id: string,
  ): Promise<MedicalRecordDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Record not found');
    }
    const record = await this.recordModel.findOne({
      _id: id,
      patientId: new Types.ObjectId(userId),
    });
    if (!record) {
      throw new NotFoundException('Record not found');
    }
    return record;
  }

  private async getOwnedAppointmentOrThrow(
    userId: string,
    id: string,
  ): Promise<AppointmentDocument> {
    const appointment = Types.ObjectId.isValid(id)
      ? await this.appointmentModel.findOne({
          _id: id,
          patientId: new Types.ObjectId(userId),
        })
      : null;
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }
    return appointment;
  }

  private toResponse(record: MedicalRecordDocument): MedicalRecordResponseDto {
    const uploadedAt = (record.uploadedAt ?? new Date()).toISOString();
    return {
      id: record.id,
      title: record.originalFileName,
      type: record.type,
      kind: record.kind ?? MedicalRecordKind.ORIGINAL,
      uploadedAt,
      recordDate: record.recordDate?.toISOString() ?? uploadedAt,
      tags: record.tags ?? [],
      providerName: record.providerName,
      derivedFromRecordId: record.derivedFromRecordId?.toString(),
      attachedAppointmentId: record.attachedAppointmentId?.toString(),
    };
  }
}

function startOfDay(isoDate: string): Date {
  const d = new Date(isoDate);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function endOfDay(isoDate: string): Date {
  const d = new Date(isoDate);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  webp: 'image/webp',
};

function guessMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXTENSION[ext] ?? 'application/octet-stream';
}
