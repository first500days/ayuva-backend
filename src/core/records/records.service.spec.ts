import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { RecordsService } from './records.service';
import {
  MedicalRecordKind,
  MedicalRecordType,
} from './schemas/medical-record.schema';
import { ReportAiStatus } from '../../ai/report-interpreter/schemas/report-interpretation.schema';

function buildService() {
  const recordModel = {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
  };
  const appointmentModel = {
    findOne: jest.fn(),
  };
  const reportInterpretationModel = {
    findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
  };
  const storageService = {
    upload: jest.fn().mockResolvedValue('records/user-1/file-key.pdf'),
    read: jest.fn().mockResolvedValue(Buffer.from('pdf-bytes')),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  const reminderQueueService = {
    sendDocumentUploadConfirmation: jest.fn().mockResolvedValue(undefined),
  };
  const service = new RecordsService(
    recordModel as any,
    appointmentModel as any,
    reportInterpretationModel as any,
    storageService as any,
    reminderQueueService as any,
  );
  return {
    service,
    recordModel,
    appointmentModel,
    reportInterpretationModel,
    storageService,
    reminderQueueService,
  };
}

function fakeFile(
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File {
  return {
    originalname: 'report.pdf',
    mimetype: 'application/pdf',
    buffer: Buffer.from('data'),
    size: 4,
    ...overrides,
  } as Express.Multer.File;
}

describe('RecordsService', () => {
  describe('upload', () => {
    it('throws BadRequestException when no file is provided', async () => {
      const { service } = buildService();
      await expect(service.upload('user-1', undefined)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws BadRequestException for an unsupported mimetype', async () => {
      const { service } = buildService();
      await expect(
        service.upload('user-1', fakeFile({ mimetype: 'application/zip' })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('honours an explicit type override instead of the filename heuristic', async () => {
      const { service, recordModel } = buildService();
      recordModel.create.mockResolvedValue({
        id: 'rec-1',
        originalFileName: 'blood-work.pdf',
        type: MedicalRecordType.DISCHARGE,
        uploadedAt: new Date(),
      });

      await service.upload(
        'user-1',
        fakeFile({ originalname: 'blood-work.pdf' }),
        { type: MedicalRecordType.DISCHARGE },
      );

      expect(recordModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: MedicalRecordType.DISCHARGE }),
      );
    });

    it.each([
      ['discharge-summary.pdf', MedicalRecordType.DISCHARGE],
      ['prescription-rx.pdf', MedicalRecordType.PRESCRIPTION],
      ['lipid-panel-blood.pdf', MedicalRecordType.LAB_REPORT],
      ['chest-xray.pdf', MedicalRecordType.SCAN],
      ['ecg-trace.pdf', MedicalRecordType.LAB_REPORT],
      ['covid-vaccination-card.pdf', MedicalRecordType.VACCINATION],
      ['health-insurance-policy.pdf', MedicalRecordType.INSURANCE],
      ['fitness-certificate.pdf', MedicalRecordType.CERTIFICATE],
    ])(
      'auto-categorises "%s" as %s from the filename heuristic',
      async (filename, expectedType) => {
        const { service, recordModel } = buildService();
        recordModel.create.mockResolvedValue({
          id: 'rec-1',
          originalFileName: filename,
          type: expectedType,
          uploadedAt: new Date(),
        });

        await service.upload('user-1', fakeFile({ originalname: filename }));

        expect(recordModel.create).toHaveBeenCalledWith(
          expect.objectContaining({ type: expectedType }),
        );
      },
    );

    it('sends a document-upload-confirmation push after a successful upload', async () => {
      const { service, recordModel, reminderQueueService } = buildService();
      recordModel.create.mockResolvedValue({
        id: 'rec-1',
        originalFileName: 'report.pdf',
        type: MedicalRecordType.PRESCRIPTION,
        uploadedAt: new Date(),
      });

      await service.upload('user-1', fakeFile());

      expect(reminderQueueService.sendDocumentUploadConfirmation).toHaveBeenCalledWith({
        recordId: 'rec-1',
        userId: 'user-1',
        fileName: 'report.pdf',
      });
    });

    it('falls back to the scans folder for an unnamed image with no filename hint', async () => {
      const { service, recordModel } = buildService();
      recordModel.create.mockResolvedValue({
        id: 'rec-1',
        originalFileName: 'IMG_20260805.jpg',
        type: MedicalRecordType.SCAN,
        uploadedAt: new Date(),
      });

      await service.upload(
        'user-1',
        fakeFile({ originalname: 'IMG_20260805.jpg', mimetype: 'image/jpeg' }),
      );

      expect(recordModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: MedicalRecordType.SCAN }),
      );
    });

    it('stores the mimetype and tags on the record', async () => {
      const { service, recordModel } = buildService();
      recordModel.create.mockImplementation((doc: object) =>
        Promise.resolve({ id: 'rec-1', uploadedAt: new Date(), ...doc }),
      );

      await service.upload('user-1', fakeFile(), { tags: ['cardiology'] });

      expect(recordModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mimeType: 'application/pdf',
          tags: ['cardiology'],
          kind: MedicalRecordKind.ORIGINAL,
        }),
      );
    });

    describe('derived documents (U07 / U09)', () => {
      const USER_ID = new Types.ObjectId().toString();
      const SOURCE_ID = new Types.ObjectId().toString();

      it('refuses a simplification with no source record', async () => {
        const { service } = buildService();
        await expect(
          service.upload(USER_ID, fakeFile(), {
            kind: MedicalRecordKind.SIMPLIFICATION,
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it("refuses a source record the caller doesn't own", async () => {
        const { service, recordModel } = buildService();
        recordModel.findOne.mockResolvedValue(null);
        await expect(
          service.upload(USER_ID, fakeFile(), {
            kind: MedicalRecordKind.SIMPLIFICATION,
            derivedFromRecordId: SOURCE_ID,
          }),
        ).rejects.toBeInstanceOf(NotFoundException);
      });

      it("files a simplification in its source's folder, linked to it", async () => {
        const { service, recordModel } = buildService();
        const sourceObjectId = new Types.ObjectId(SOURCE_ID);
        recordModel.findOne.mockResolvedValue({
          _id: sourceObjectId,
          type: MedicalRecordType.SCAN,
          providerName: 'City Imaging',
        });
        recordModel.create.mockImplementation((doc: object) =>
          Promise.resolve({ id: 'rec-2', uploadedAt: new Date(), ...doc }),
        );

        const result = await service.upload(
          USER_ID,
          fakeFile({ originalname: 'Explanation.pdf' }),
          {
            kind: MedicalRecordKind.SIMPLIFICATION,
            derivedFromRecordId: SOURCE_ID,
          },
        );

        expect(recordModel.create).toHaveBeenCalledWith(
          expect.objectContaining({
            type: MedicalRecordType.SCAN,
            kind: MedicalRecordKind.SIMPLIFICATION,
            derivedFromRecordId: sourceObjectId,
            providerName: 'City Imaging',
          }),
        );
        expect(result.derivedFromRecordId).toBe(SOURCE_ID);
      });

      it('attaches a visit summary to its appointment', async () => {
        const { service, recordModel, appointmentModel } = buildService();
        const appointmentId = new Types.ObjectId().toString();
        appointmentModel.findOne.mockResolvedValue({ id: appointmentId });
        recordModel.create.mockImplementation((doc: object) =>
          Promise.resolve({ id: 'rec-3', uploadedAt: new Date(), ...doc }),
        );

        const result = await service.upload(
          USER_ID,
          fakeFile({ originalname: 'Visit summary.pdf' }),
          { kind: MedicalRecordKind.VISIT_SUMMARY, appointmentId },
        );

        expect(result.kind).toBe(MedicalRecordKind.VISIT_SUMMARY);
        expect(result.attachedAppointmentId).toBe(appointmentId);
      });
    });
  });

  describe('findAll (U08 vault)', () => {
    const USER_ID = new Types.ObjectId().toString();

    function mockFind(recordModel: { find: jest.Mock }, rows: object[] = []) {
      const exec = jest.fn().mockResolvedValue(rows);
      recordModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({ exec }),
      });
    }

    it('leaves visit summaries out of a folder listing', async () => {
      const { service, recordModel } = buildService();
      mockFind(recordModel);

      await service.findAll(USER_ID, { type: MedicalRecordType.PRESCRIPTION });

      const filter = recordModel.find.mock.calls[0][0];
      expect(filter.$and).toContainEqual({
        type: MedicalRecordType.PRESCRIPTION,
        kind: { $ne: MedicalRecordKind.VISIT_SUMMARY },
      });
    });

    it('sorts by clinical date, falling back to upload date', async () => {
      const { service, recordModel } = buildService();
      mockFind(recordModel, [
        {
          id: 'old-upload-recent-report',
          originalFileName: 'a.pdf',
          type: MedicalRecordType.LAB_REPORT,
          uploadedAt: new Date('2026-01-01'),
          recordDate: new Date('2026-09-01'),
        },
        {
          id: 'recent-upload',
          originalFileName: 'b.pdf',
          type: MedicalRecordType.LAB_REPORT,
          uploadedAt: new Date('2026-08-01'),
        },
      ]);

      const result = await service.findAll(USER_ID);

      expect(result.map((r) => r.id)).toEqual([
        'old-upload-recent-report',
        'recent-upload',
      ]);
    });
  });

  describe('update / remove (U08 row menu)', () => {
    const USER_ID = new Types.ObjectId().toString();
    const RECORD_ID = new Types.ObjectId().toString();

    it('moves, renames and re-tags an owned record', async () => {
      const { service, recordModel } = buildService();
      const record = {
        id: RECORD_ID,
        originalFileName: 'scan.pdf',
        type: MedicalRecordType.SCAN,
        tags: [] as string[],
        save: jest.fn().mockResolvedValue(undefined),
      };
      recordModel.findOne.mockResolvedValue(record);

      const result = await service.update(USER_ID, RECORD_ID, {
        title: ' Chest X-ray ',
        type: MedicalRecordType.DISCHARGE,
        tags: ['respiratory'],
      });

      expect(record.save).toHaveBeenCalled();
      expect(result).toMatchObject({
        title: 'Chest X-ray',
        type: MedicalRecordType.DISCHARGE,
        tags: ['respiratory'],
      });
    });

    it("404s on someone else's record", async () => {
      const { service, recordModel } = buildService();
      recordModel.findOne.mockResolvedValue(null);
      await expect(
        service.update(USER_ID, RECORD_ID, { tags: [] }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.remove(USER_ID, RECORD_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('deletes the record and its stored file, and unlinks explanations of it', async () => {
      const { service, recordModel, storageService } = buildService();
      const _id = new Types.ObjectId(RECORD_ID);
      recordModel.findOne.mockResolvedValue({ _id, fileRef: 'records/x.pdf' });

      await service.remove(USER_ID, RECORD_ID);

      expect(recordModel.deleteOne).toHaveBeenCalledWith({ _id });
      expect(recordModel.updateMany).toHaveBeenCalledWith(
        { derivedFromRecordId: _id },
        { $unset: { derivedFromRecordId: '' } },
      );
      expect(storageService.remove).toHaveBeenCalledWith('records/x.pdf');
    });

    it('downloads with the stored mimetype, guessing it for older records', async () => {
      const { service, recordModel } = buildService();
      recordModel.findOne.mockResolvedValue({
        fileRef: 'records/x.png',
        originalFileName: 'x.png',
      });

      const file = await service.download(USER_ID, RECORD_ID);

      expect(file.mimeType).toBe('image/png');
      expect(file.buffer.toString()).toBe('pdf-bytes');
    });
  });

  describe('findOne (FR-8.4, FR-9.2)', () => {
    const USER_ID = new Types.ObjectId().toString();
    const RECORD_ID = new Types.ObjectId().toString();

    it('throws NotFoundException for a syntactically invalid id', async () => {
      const { service } = buildService();
      await expect(
        service.findOne(USER_ID, 'not-an-id'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when the record does not belong to the caller', async () => {
      const { service, recordModel } = buildService();
      recordModel.findOne.mockResolvedValue(null);

      await expect(
        service.findOne(USER_ID, RECORD_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('defaults aiStatus to "queued" when no ReportInterpretation exists yet', async () => {
      const { service, recordModel, reportInterpretationModel } =
        buildService();
      recordModel.findOne.mockResolvedValue({
        id: RECORD_ID,
        originalFileName: 'lipid-panel.pdf',
        type: MedicalRecordType.LAB_REPORT,
        uploadedAt: new Date('2026-08-01T00:00:00.000Z'),
      });
      reportInterpretationModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await service.findOne(USER_ID, RECORD_ID);

      expect(result.aiStatus).toBe(ReportAiStatus.QUEUED);
      expect(result.summaryText).toBeUndefined();
    });

    it('surfaces the real aiStatus and summary once an interpretation exists', async () => {
      const { service, recordModel, reportInterpretationModel } =
        buildService();
      recordModel.findOne.mockResolvedValue({
        id: RECORD_ID,
        originalFileName: 'lipid-panel.pdf',
        type: MedicalRecordType.LAB_REPORT,
        uploadedAt: new Date('2026-08-01T00:00:00.000Z'),
      });
      reportInterpretationModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          aiStatus: ReportAiStatus.INTERPRETED,
          summaryText: 'Your lipid panel looks normal overall.',
        }),
      });

      const result = await service.findOne(USER_ID, RECORD_ID);

      expect(result.aiStatus).toBe(ReportAiStatus.INTERPRETED);
      expect(result.summaryText).toBe(
        'Your lipid panel looks normal overall.',
      );
    });
  });

  describe('attachToAppointment (FR-9.5)', () => {
    const USER_ID = new Types.ObjectId().toString();
    const RECORD_ID = new Types.ObjectId().toString();
    const APPOINTMENT_ID = new Types.ObjectId().toString();

    it('throws NotFoundException for a syntactically invalid record or appointment id', async () => {
      const { service } = buildService();
      await expect(
        service.attachToAppointment(USER_ID, 'not-an-id', APPOINTMENT_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when the record does not belong to the caller', async () => {
      const { service, recordModel } = buildService();
      recordModel.findOne.mockResolvedValue(null);

      await expect(
        service.attachToAppointment(USER_ID, RECORD_ID, APPOINTMENT_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when the appointment does not belong to the caller', async () => {
      const { service, recordModel, appointmentModel } = buildService();
      recordModel.findOne.mockResolvedValue({
        id: RECORD_ID,
        save: jest.fn(),
      });
      appointmentModel.findOne.mockResolvedValue(null);

      await expect(
        service.attachToAppointment(USER_ID, RECORD_ID, APPOINTMENT_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('sets attachedAppointmentId and saves when both ids are owned by the caller', async () => {
      const { service, recordModel, appointmentModel } = buildService();
      const save = jest.fn().mockResolvedValue(undefined);
      const record: {
        id: string;
        originalFileName: string;
        type: MedicalRecordType;
        uploadedAt: Date;
        attachedAppointmentId?: Types.ObjectId;
        save: jest.Mock;
      } = {
        id: RECORD_ID,
        originalFileName: 'lipid-panel.pdf',
        type: MedicalRecordType.LAB_REPORT,
        uploadedAt: new Date('2026-08-01T00:00:00.000Z'),
        save,
      };
      recordModel.findOne.mockResolvedValue(record);
      appointmentModel.findOne.mockResolvedValue({ id: APPOINTMENT_ID });

      const result = await service.attachToAppointment(
        USER_ID,
        RECORD_ID,
        APPOINTMENT_ID,
      );

      expect(record.attachedAppointmentId?.toString()).toBe(APPOINTMENT_ID);
      expect(save).toHaveBeenCalled();
      expect(result.attachedAppointmentId).toBe(APPOINTMENT_ID);
    });
  });
});
