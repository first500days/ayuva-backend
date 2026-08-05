import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  MedicalRecord,
  MedicalRecordDocument,
  MedicalRecordType,
} from './schemas/medical-record.schema';
import {
  Appointment,
  AppointmentDocument,
} from '../appointments/schemas/appointment.schema';
import { StorageService } from '../../storage/storage.service';
import { MedicalRecordResponseDto } from './dto/medical-record-response.dto';

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
  [
    /blood|cbc|lipid|glucose|hba1c|panel|h(a)?ematology/i,
    MedicalRecordType.BLOOD,
  ],
  [
    /x-?ray|mri|ct[-_ ]?scan|ultrasound|echo|ecg|scan|imaging|radiology/i,
    MedicalRecordType.IMAGING,
  ],
];

@Injectable()
export class RecordsService {
  constructor(
    @InjectModel(MedicalRecord.name)
    private readonly recordModel: Model<MedicalRecordDocument>,
    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,
    private readonly storageService: StorageService,
  ) {}

  async upload(
    userId: string,
    file: Express.Multer.File | undefined,
    typeOverride?: MedicalRecordType,
  ): Promise<MedicalRecordResponseDto> {
    if (!file) {
      throw new BadRequestException('A file is required');
    }
    if (!ALLOWED_RECORD_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type "${file.mimetype}" — allowed: ${ALLOWED_RECORD_MIME_TYPES.join(', ')}`,
      );
    }

    const type =
      typeOverride ?? this.categorize(file.originalname, file.mimetype);
    const fileRef = await this.storageService.upload(
      file.buffer,
      file.originalname,
      userId,
    );

    const record = await this.recordModel.create({
      patientId: userId,
      fileRef,
      originalFileName: file.originalname,
      type,
    });

    return this.toResponse(record);
  }

  async findAll(
    userId: string,
    type?: MedicalRecordType,
  ): Promise<MedicalRecordResponseDto[]> {
    const records = await this.recordModel
      .find({
        patientId: new Types.ObjectId(userId),
        ...(type ? { type } : {}),
      })
      .sort({ uploadedAt: -1 })
      .exec();
    return records.map((r) => this.toResponse(r));
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
      // Photo/scan capture with no recognisable filename hint (FR-8.1) — imaging is the safest default.
      return MedicalRecordType.IMAGING;
    }
    // Generic scanned/typed document with no other signal — most common real-world catch-all.
    return MedicalRecordType.PRESCRIPTION;
  }

  private toResponse(record: MedicalRecordDocument): MedicalRecordResponseDto {
    return {
      id: record.id,
      title: record.originalFileName,
      type: record.type,
      uploadedAt: (record.uploadedAt ?? new Date()).toISOString(),
      attachedAppointmentId: record.attachedAppointmentId?.toString(),
    };
  }
}
