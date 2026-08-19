import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MedicalRecord, MedicalRecordDocument, MedicalRecordType, RecordStatusEnhanced } from '../../core/records/schemas/medical-record.schema';
import { User, UserDocument } from '../../core/users/schemas/user.schema';
import { QueryAdminRecordsDto } from './dto/query-admin-records.dto';
import { AdminRecordResponseDto } from './dto/admin-record-response.dto';
import { buildSafeRegex } from '../../common/utils/regex.util';

@Injectable()
export class AdminRecordsService {
  constructor(
    @InjectModel(MedicalRecord.name)
    private readonly medicalRecordModel: Model<MedicalRecordDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async findAll(query: QueryAdminRecordsDto): Promise<AdminRecordResponseDto[]> {
    const and: any[] = [];

    if (query.search) {
      const re = buildSafeRegex(query.search);
      and.push({ $or: [{ originalFileName: re }] });
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
      .exec();
    const patientById = new Map(patients.map((p) => [p.id, p]));

    return records.map((r) => ({
      id: r.id,
      patientId: r.patientId.toString(),
      patientName: patientById.get(r.patientId.toString())?.fullName ?? 'Unknown patient',
      type: r.type,
      originalFileName: r.originalFileName,
      uploadedAt: (r.uploadedAt ?? new Date(0)).toISOString(),
      status: r.status ?? RecordStatusEnhanced.UPLOADED,
      aiStatus: r.aiStatus,
    }));
  }

  async findOne(id: string): Promise<AdminRecordResponseDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Record not found');
    }
    const record = await this.medicalRecordModel.findById(id).exec();
    if (!record) {
      throw new NotFoundException('Record not found');
    }

    const patient = await this.userModel.findById(record.patientId).exec();

    return {
      id: record.id,
      patientId: record.patientId.toString(),
      patientName: patient?.fullName ?? 'Unknown patient',
      type: record.type,
      originalFileName: record.originalFileName,
      uploadedAt: (record.uploadedAt ?? new Date(0)).toISOString(),
      status: record.status ?? RecordStatusEnhanced.UPLOADED,
      aiStatus: record.aiStatus,
    };
  }
}
