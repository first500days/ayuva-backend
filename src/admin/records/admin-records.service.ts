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

  async getAccessLogs() {
    return [
      {
        id: 'ACC-4001',
        recordId: 'rec_ecg_01',
        recordName: 'Resting_12_Lead_ECG.pdf',
        patientName: 'Rahul Sharma',
        accessorName: 'Dr. Arvind Menon',
        accessorRole: 'Consulting Cardiologist',
        purpose: 'Pre-appointment diagnostic evaluation',
        ipAddress: '103.21.244.12',
        accessedAt: '2026-08-20T09:14:22Z',
        authStatus: 'authorized',
      },
      {
        id: 'ACC-4002',
        recordId: 'rec_thy_02',
        recordName: 'Thyroid_Profile_Report.pdf',
        patientName: 'Ananya Iyer',
        accessorName: 'Dr. Priya Desai',
        accessorRole: 'Treating Physician',
        purpose: 'Dosage adjustment consultation',
        ipAddress: '115.112.89.54',
        accessedAt: '2026-08-19T16:02:10Z',
        authStatus: 'authorized',
      },
      {
        id: 'ACC-4003',
        recordId: 'rec_mri_03',
        recordName: 'Lumbar_Spine_MRI.dcm',
        patientName: 'Sanjay Dutt',
        accessorName: 'Unverified External Portal IP',
        accessorRole: 'Third-party API Client',
        purpose: 'Direct API request without active consent token',
        ipAddress: '185.220.101.5',
        accessedAt: '2026-08-19T02:11:45Z',
        authStatus: 'blocked',
      },
    ];
  }

  async archive(id: string) {
    const record = await this.medicalRecordModel.findById(id).exec();
    if (!record) throw new NotFoundException('Record not found');
    record.status = RecordStatusEnhanced.ARCHIVED;
    await record.save();
    return this.findOne(id);
  }

  async reprocess(id: string) {
    const record = await this.medicalRecordModel.findById(id).exec();
    if (!record) throw new NotFoundException('Record not found');
    record.status = RecordStatusEnhanced.PROCESSING;
    await record.save();
    return this.findOne(id);
  }
}
