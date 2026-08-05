import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AdminReportsService } from './admin-reports.service';
import { MedicalRecordType } from '../../core/records/schemas/medical-record.schema';
import { ReportAiStatus } from '../../ai/report-interpreter/schemas/report-interpretation.schema';

function buildService() {
  const medicalRecordModel = {
    find: jest.fn(),
    findById: jest.fn(),
  };
  const reportInterpretationModel = {
    find: jest.fn(),
    findOne: jest.fn(),
  };
  const userModel = {
    find: jest.fn(),
    findById: jest.fn(),
  };
  const storageService = {
    read: jest.fn(),
  };
  const service = new AdminReportsService(
    medicalRecordModel as any,
    reportInterpretationModel as any,
    userModel as any,
    storageService as any,
  );
  return {
    service,
    medicalRecordModel,
    reportInterpretationModel,
    userModel,
    storageService,
  };
}

const RECORD_ID = new Types.ObjectId().toString();
const PATIENT_ID = new Types.ObjectId();

describe('AdminReportsService', () => {
  describe('findOne (FR-16.2)', () => {
    it('throws NotFoundException for a syntactically invalid id', async () => {
      const { service } = buildService();
      await expect(service.findOne('not-an-id')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws NotFoundException when no matching MedicalRecord exists', async () => {
      const { service, medicalRecordModel } = buildService();
      medicalRecordModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.findOne(RECORD_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('defaults aiStatus to queued when no ReportInterpretation exists yet', async () => {
      const { service, medicalRecordModel, reportInterpretationModel, userModel } =
        buildService();
      medicalRecordModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          id: RECORD_ID,
          patientId: PATIENT_ID,
          type: MedicalRecordType.BLOOD,
          uploadedAt: new Date('2026-08-01T00:00:00.000Z'),
        }),
      });
      reportInterpretationModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      userModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ fullName: 'Amara Okafor' }),
      });

      const result = await service.findOne(RECORD_ID);

      expect(result.aiStatus).toBe(ReportAiStatus.QUEUED);
      expect(result.patientName).toBe('Amara Okafor');
    });
  });

  describe('getFile (FR-16.2)', () => {
    it('throws NotFoundException when no matching MedicalRecord exists', async () => {
      const { service, medicalRecordModel } = buildService();
      medicalRecordModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.getFile(RECORD_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('reads the decrypted buffer via StorageService and infers content type from record type', async () => {
      const { service, medicalRecordModel, storageService } = buildService();
      medicalRecordModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          id: RECORD_ID,
          fileRef: 'records/patient-1/file.jpg',
          type: MedicalRecordType.IMAGING,
        }),
      });
      storageService.read.mockResolvedValue(Buffer.from('binary-data'));

      const result = await service.getFile(RECORD_ID);

      expect(storageService.read).toHaveBeenCalledWith(
        'records/patient-1/file.jpg',
      );
      expect(result.contentType).toBe('image/jpeg');
      expect(result.buffer).toEqual(Buffer.from('binary-data'));
    });

    it('defaults to application/octet-stream for a record type with no known mimetype', async () => {
      const { service, medicalRecordModel, storageService } = buildService();
      medicalRecordModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          id: RECORD_ID,
          fileRef: 'records/patient-1/file.pdf',
          type: MedicalRecordType.BLOOD,
        }),
      });
      storageService.read.mockResolvedValue(Buffer.from('binary-data'));

      const result = await service.getFile(RECORD_ID);

      expect(result.contentType).toBe('application/octet-stream');
    });
  });
});
