import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AdminUsersService } from './admin-users.service';
import { UserRole, UserStatus } from '../../core/users/schemas/user.schema';
import { AppointmentStatus } from '../../core/appointments/schemas/appointment.schema';
import { MedicationLogStatus } from '../../core/medications/schemas/medication-log.schema';

function buildService() {
  const userModel = {
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };
  const healthProfileModel = {
    find: jest.fn(),
    findOne: jest.fn(),
  };
  const appointmentModel = {
    find: jest.fn(),
  };
  const appointmentSlotModel = {
    find: jest.fn(),
  };
  const providerModel = {
    find: jest.fn(),
  };
  const medicationModel = {
    find: jest.fn(),
  };
  const medicationLogModel = {
    find: jest.fn(),
  };
  const medicalRecordModel = {
    find: jest.fn(),
  };
  const service = new AdminUsersService(
    userModel as any,
    healthProfileModel as any,
    appointmentModel as any,
    appointmentSlotModel as any,
    providerModel as any,
    medicationModel as any,
    medicationLogModel as any,
    medicalRecordModel as any,
  );
  return {
    service,
    userModel,
    healthProfileModel,
    appointmentModel,
    appointmentSlotModel,
    providerModel,
    medicationModel,
    medicationLogModel,
    medicalRecordModel,
  };
}

const USER_ID = new Types.ObjectId();

function execResolve<T>(value: T) {
  return { exec: jest.fn().mockResolvedValue(value) };
}

function sortExecResolve<T>(value: T) {
  return { sort: jest.fn().mockReturnValue(execResolve(value)) };
}

describe('AdminUsersService', () => {
  describe('findAll — activityLevel (FR-12.1)', () => {
    it('marks a patient with no appointments/medications as low activity', async () => {
      const {
        service,
        userModel,
        healthProfileModel,
        appointmentModel,
        medicationModel,
      } = buildService();
      userModel.find.mockReturnValue(
        sortExecResolve([
          {
            _id: USER_ID,
            id: USER_ID.toString(),
            fullName: 'Amara Okafor',
            email: 'amara@example.com',
            role: UserRole.PATIENT,
            status: UserStatus.ACTIVE,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ]),
      );
      healthProfileModel.find.mockReturnValue(execResolve([]));
      appointmentModel.find.mockReturnValue(execResolve([]));
      medicationModel.find.mockReturnValue(execResolve([]));

      const result = await service.findAll({});

      expect(result[0].activityLevel).toBe('low');
    });

    it('marks a patient with >=5 combined recent actions as high activity', async () => {
      const {
        service,
        userModel,
        healthProfileModel,
        appointmentModel,
        medicationModel,
        medicationLogModel,
      } = buildService();
      userModel.find.mockReturnValue(
        sortExecResolve([
          {
            _id: USER_ID,
            id: USER_ID.toString(),
            fullName: 'Amara Okafor',
            email: 'amara@example.com',
            role: UserRole.PATIENT,
            status: UserStatus.ACTIVE,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ]),
      );
      healthProfileModel.find.mockReturnValue(execResolve([]));
      appointmentModel.find.mockReturnValue(
        execResolve(
          Array.from({ length: 3 }, () => ({ patientId: USER_ID })),
        ),
      );
      const medicationId = new Types.ObjectId();
      medicationModel.find.mockReturnValue(
        execResolve([
          { _id: medicationId, id: medicationId.toString(), userId: USER_ID },
        ]),
      );
      medicationLogModel.find.mockReturnValue(
        execResolve(
          Array.from({ length: 2 }, () => ({ medicationId })),
        ),
      );

      const result = await service.findAll({});

      expect(result[0].activityLevel).toBe('high');
    });
  });

  describe('updateStatus', () => {
    it('throws NotFoundException for a syntactically invalid id', async () => {
      const { service } = buildService();
      await expect(
        service.updateStatus('not-an-id', { status: UserStatus.INACTIVE }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when no matching patient exists', async () => {
      const { service, userModel } = buildService();
      userModel.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        service.updateStatus(USER_ID.toString(), {
          status: UserStatus.INACTIVE,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getActivityHistory (FR-12.3)', () => {
    it('throws NotFoundException when no matching patient exists', async () => {
      const { service, userModel } = buildService();
      userModel.findOne.mockResolvedValue(null);

      await expect(
        service.getActivityHistory(USER_ID.toString()),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('merges appointments, medication logs, and records sorted by occurredAt desc', async () => {
      const {
        service,
        userModel,
        appointmentModel,
        appointmentSlotModel,
        providerModel,
        medicationModel,
        medicationLogModel,
        medicalRecordModel,
      } = buildService();
      const providerId = new Types.ObjectId();
      const slotId = new Types.ObjectId();
      const medicationId = new Types.ObjectId();

      userModel.findOne.mockResolvedValue({
        _id: USER_ID,
        id: USER_ID.toString(),
        role: UserRole.PATIENT,
      });
      appointmentModel.find.mockReturnValue(
        execResolve([
          {
            patientId: USER_ID,
            providerId,
            slotId,
            status: AppointmentStatus.CONFIRMED,
          },
        ]),
      );
      medicationModel.find.mockReturnValue(
        execResolve([
          {
            _id: medicationId,
            id: medicationId.toString(),
            userId: USER_ID,
            name: 'Metformin',
          },
        ]),
      );
      medicalRecordModel.find.mockReturnValue(
        execResolve([
          {
            originalFileName: 'lipid-panel.pdf',
            type: 'blood',
            uploadedAt: new Date('2026-08-04T00:00:00.000Z'),
          },
        ]),
      );
      appointmentSlotModel.find.mockReturnValue(
        execResolve([
          {
            id: slotId.toString(),
            date: new Date('2026-08-01T00:00:00.000Z'),
          },
        ]),
      );
      providerModel.find.mockReturnValue(
        execResolve([{ id: providerId.toString(), name: 'Dr. Menon' }]),
      );
      medicationLogModel.find.mockReturnValue(
        execResolve([
          {
            medicationId,
            status: MedicationLogStatus.TAKEN,
            scheduledAt: new Date('2026-08-02T00:00:00.000Z'),
            actionedAt: new Date('2026-08-02T08:00:00.000Z'),
          },
        ]),
      );

      const result = await service.getActivityHistory(USER_ID.toString());

      expect(result).toHaveLength(3);
      expect(result[0].type).toBe('record');
      expect(result[0].occurredAt).toBe('2026-08-04T00:00:00.000Z');
      expect(result.map((r) => r.type)).toEqual(
        expect.arrayContaining(['appointment', 'medicationLog', 'record']),
      );
    });
  });
});
