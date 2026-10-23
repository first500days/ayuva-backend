import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AdminReportsService, processingMethodOf } from './admin-reports.service';
import { MedicalRecordType } from '../../core/records/schemas/medical-record.schema';
import {
  ExtractionMethod,
  ReportAiStatus,
} from '../../ai/report-interpreter/schemas/report-interpretation.schema';

/** findById() result usable both as `.exec()` and `.select().lean().exec()`. */
function query(result: unknown) {
  const q: Record<string, jest.Mock> = { exec: jest.fn().mockResolvedValue(result) };
  q.select = jest.fn(() => q);
  q.lean = jest.fn(() => q);
  return q;
}

const CONSENTING_PATIENT = {
  fullName: 'Amara Okafor',
  consent: { healthDataProcessingAccepted: true, version: '2026-01-01', acceptedAt: new Date() },
};

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
    findById: jest.fn().mockReturnValue(query(CONSENTING_PATIENT)),
  };
  const storageService = {
    read: jest.fn(),
  };
  const auditLogService = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new AdminReportsService(
    medicalRecordModel as any,
    reportInterpretationModel as any,
    userModel as any,
    storageService as any,
    auditLogService as any,
  );
  return {
    service,
    medicalRecordModel,
    reportInterpretationModel,
    userModel,
    storageService,
    auditLogService,
  };
}

const RECORD_ID = new Types.ObjectId().toString();
const PATIENT_ID = new Types.ObjectId();
const ACTOR_ID = new Types.ObjectId().toString();

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
      const { service, medicalRecordModel, reportInterpretationModel } =
        buildService();
      medicalRecordModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          id: RECORD_ID,
          patientId: PATIENT_ID,
          type: MedicalRecordType.LAB_REPORT,
          uploadedAt: new Date('2026-08-01T00:00:00.000Z'),
        }),
      });
      reportInterpretationModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await service.findOne(RECORD_ID);

      expect(result.aiStatus).toBe(ReportAiStatus.QUEUED);
      expect(result.patientName).toBe('Amara Okafor');
      expect(result.processingMethod).toBeNull();
    });
  });

  describe('processingMethodOf ("Processing Method" column)', () => {
    it('is MD Verified once a clinician has confirmed the values', () => {
      expect(
        processingMethodOf({ verifiedAt: new Date(), extractionMethod: ExtractionMethod.AI_PARSED }),
      ).toBe('md_verified');
    });

    it('is the extraction method otherwise', () => {
      expect(processingMethodOf({ extractionMethod: ExtractionMethod.AI_PARSED })).toBe('ai_parsed');
      expect(processingMethodOf({ extractionMethod: ExtractionMethod.OCR_EXTRACTED })).toBe(
        'ocr_extracted',
      );
    });

    it('is null before anything was extracted', () => {
      expect(processingMethodOf(null)).toBeNull();
    });
  });

  describe('getFile (FR-16.2)', () => {
    it('throws NotFoundException when no matching MedicalRecord exists', async () => {
      const { service, medicalRecordModel } = buildService();
      medicalRecordModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.getFile(RECORD_ID, ACTOR_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('reads the decrypted buffer via StorageService and infers content type from record type', async () => {
      const { service, medicalRecordModel, storageService } = buildService();
      medicalRecordModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          id: RECORD_ID,
          patientId: PATIENT_ID,
          fileRef: 'records/patient-1/file.jpg',
          type: MedicalRecordType.SCAN,
        }),
      });
      storageService.read.mockResolvedValue(Buffer.from('binary-data'));

      const result = await service.getFile(RECORD_ID, ACTOR_ID);

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
          patientId: PATIENT_ID,
          fileRef: 'records/patient-1/file.pdf',
          type: MedicalRecordType.LAB_REPORT,
        }),
      });
      storageService.read.mockResolvedValue(Buffer.from('binary-data'));

      const result = await service.getFile(RECORD_ID, ACTOR_ID);

      expect(result.contentType).toBe('application/octet-stream');
    });

    it('refuses a record with no consent token (locked) and audits the attempt', async () => {
      const { service, medicalRecordModel, userModel, storageService, auditLogService } =
        buildService();
      medicalRecordModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          id: RECORD_ID,
          patientId: PATIENT_ID,
          fileRef: 'records/patient-1/file.pdf',
          type: MedicalRecordType.LAB_REPORT,
        }),
      });
      userModel.findById.mockReturnValue(
        query({ consent: { healthDataProcessingAccepted: false } }),
      );

      await expect(service.getFile(RECORD_ID, ACTOR_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(storageService.read).not.toHaveBeenCalled();
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'record_access_blocked', targetId: RECORD_ID }),
      );
    });
  });
});
