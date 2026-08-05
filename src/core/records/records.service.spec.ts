import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { RecordsService } from './records.service';
import { MedicalRecordType } from './schemas/medical-record.schema';

function buildService() {
  const recordModel = {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  };
  const appointmentModel = {
    findOne: jest.fn(),
  };
  const storageService = {
    upload: jest.fn().mockResolvedValue('records/user-1/file-key.pdf'),
  };
  const service = new RecordsService(
    recordModel as any,
    appointmentModel as any,
    storageService as any,
  );
  return { service, recordModel, appointmentModel, storageService };
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
        MedicalRecordType.DISCHARGE,
      );

      expect(recordModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: MedicalRecordType.DISCHARGE }),
      );
    });

    it.each([
      ['discharge-summary.pdf', MedicalRecordType.DISCHARGE],
      ['prescription-rx.pdf', MedicalRecordType.PRESCRIPTION],
      ['lipid-panel-blood.pdf', MedicalRecordType.BLOOD],
      ['chest-xray.pdf', MedicalRecordType.IMAGING],
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

    it('falls back to imaging for an unnamed image with no filename hint', async () => {
      const { service, recordModel } = buildService();
      recordModel.create.mockResolvedValue({
        id: 'rec-1',
        originalFileName: 'IMG_20260805.jpg',
        type: MedicalRecordType.IMAGING,
        uploadedAt: new Date(),
      });

      await service.upload(
        'user-1',
        fakeFile({ originalname: 'IMG_20260805.jpg', mimetype: 'image/jpeg' }),
      );

      expect(recordModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: MedicalRecordType.IMAGING }),
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
        type: MedicalRecordType.BLOOD,
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
