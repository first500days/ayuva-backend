import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { AppointmentsService } from './appointments.service';
import { AppointmentStatus } from './schemas/appointment.schema';
import { ProviderStatus } from '../providers/schemas/provider.schema';

function buildService() {
  const appointmentModel = {
    create: jest.fn(),
    find: jest.fn(),
    findById: jest.fn(),
  };
  const slotModel = {
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn().mockReturnValue({ catch: jest.fn() }),
    findById: jest.fn(),
  };
  const providerModel = {
    findOne: jest.fn(),
    find: jest.fn(),
    findById: jest.fn(),
  };
  const reminderQueueService = {
    scheduleAppointmentReminder: jest.fn(),
    cancelAppointmentReminder: jest.fn(),
    scheduleFollowUpReminder: jest.fn(),
    cancelFollowUpReminder: jest.fn(),
  };
  const service = new AppointmentsService(
    appointmentModel as any,
    slotModel as any,
    providerModel as any,
    reminderQueueService as any,
  );
  return {
    service,
    appointmentModel,
    slotModel,
    providerModel,
    reminderQueueService,
  };
}

const USER_ID = new Types.ObjectId().toString();
const PROVIDER_ID = new Types.ObjectId().toString();
const SLOT_ID = new Types.ObjectId().toString();

describe('AppointmentsService', () => {
  describe('create (DC-4)', () => {
    it('throws NotFoundException when the provider does not exist or is inactive', async () => {
      const { service, providerModel } = buildService();
      providerModel.findOne.mockResolvedValue(null);

      await expect(
        service.create(USER_ID, { providerId: PROVIDER_ID, slotId: SLOT_ID }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ConflictException when the atomic slot flip finds nothing to update (already booked)', async () => {
      const { service, providerModel, slotModel } = buildService();
      providerModel.findOne.mockResolvedValue({
        id: PROVIDER_ID,
        status: ProviderStatus.ACTIVE,
      });
      slotModel.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        service.create(USER_ID, { providerId: PROVIDER_ID, slotId: SLOT_ID }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rolls the slot back to open if appointment creation fails after the slot was booked', async () => {
      const { service, providerModel, slotModel, appointmentModel } =
        buildService();
      providerModel.findOne.mockResolvedValue({
        id: PROVIDER_ID,
        status: ProviderStatus.ACTIVE,
      });
      slotModel.findOneAndUpdate.mockResolvedValue({
        id: SLOT_ID,
        date: new Date(),
        time: '10:00',
      });
      appointmentModel.create.mockRejectedValue(new Error('write failed'));

      await expect(
        service.create(USER_ID, { providerId: PROVIDER_ID, slotId: SLOT_ID }),
      ).rejects.toThrow('write failed');
      expect(slotModel.updateOne).toHaveBeenCalledWith(
        { _id: SLOT_ID },
        expect.objectContaining({ $set: { status: 'open' } }),
      );
    });
  });

  describe('update', () => {
    it('throws BadRequestException when neither status nor newSlotId is provided', async () => {
      const { service } = buildService();
      await expect(service.update(SLOT_ID, USER_ID, {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws NotFoundException when the appointment does not belong to the caller', async () => {
      const { service, appointmentModel } = buildService();
      appointmentModel.findById.mockResolvedValue({
        patientId: new Types.ObjectId(),
        status: AppointmentStatus.CONFIRMED,
      });

      await expect(
        service.update(SLOT_ID, USER_ID, { status: 'cancelled' as any }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when trying to modify a non-confirmed appointment', async () => {
      const { service, appointmentModel } = buildService();
      appointmentModel.findById.mockResolvedValue({
        patientId: { toString: () => USER_ID },
        status: AppointmentStatus.CANCELLED,
      });

      await expect(
        service.update(SLOT_ID, USER_ID, { status: 'cancelled' as any }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('update — reminder wiring (FR-7.6)', () => {
    function ownedAppointment(overrides: Record<string, unknown> = {}) {
      return {
        id: SLOT_ID,
        patientId: { toString: () => USER_ID },
        providerId: PROVIDER_ID,
        slotId: { toString: () => SLOT_ID },
        status: AppointmentStatus.CONFIRMED,
        reminderEnabled: false,
        save: jest.fn().mockResolvedValue(undefined),
        ...overrides,
      };
    }

    it('throws BadRequestException when status, newSlotId, and reminderEnabled are all absent', async () => {
      const { service } = buildService();
      await expect(service.update(SLOT_ID, USER_ID, {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('schedules a reminder job when reminderEnabled is toggled on', async () => {
      const { service, appointmentModel, providerModel, slotModel, reminderQueueService } =
        buildService();
      appointmentModel.findById.mockResolvedValue(ownedAppointment());
      providerModel.findById.mockResolvedValue({ name: 'Dr. Menon' });
      slotModel.findById.mockResolvedValue({
        date: new Date('2026-08-14T00:00:00Z'),
        time: '10:30',
      });

      await service.update(SLOT_ID, USER_ID, { reminderEnabled: true });

      expect(reminderQueueService.scheduleAppointmentReminder).toHaveBeenCalledWith(
        expect.objectContaining({ providerName: 'Dr. Menon', time: '10:30' }),
      );
    });

    it('cancels the reminder job when reminderEnabled is toggled off', async () => {
      const { service, appointmentModel, providerModel, slotModel, reminderQueueService } =
        buildService();
      appointmentModel.findById.mockResolvedValue(
        ownedAppointment({ reminderEnabled: true }),
      );
      providerModel.findById.mockResolvedValue({ name: 'Dr. Menon' });
      slotModel.findById.mockResolvedValue({
        date: new Date('2026-08-14T00:00:00Z'),
        time: '10:30',
      });

      await service.update(SLOT_ID, USER_ID, { reminderEnabled: false });

      expect(reminderQueueService.cancelAppointmentReminder).toHaveBeenCalledWith(
        SLOT_ID,
      );
      expect(reminderQueueService.scheduleAppointmentReminder).not.toHaveBeenCalled();
    });

    it('cancels any pending reminder job on cancellation — a stale job firing is a real bug', async () => {
      const { service, appointmentModel, providerModel, slotModel, reminderQueueService } =
        buildService();
      appointmentModel.findById.mockResolvedValue(ownedAppointment());
      providerModel.findById.mockResolvedValue({ name: 'Dr. Menon' });
      slotModel.findById.mockResolvedValue({
        date: new Date('2026-08-14T00:00:00Z'),
        time: '10:30',
      });

      await service.update(SLOT_ID, USER_ID, { status: 'cancelled' as any });

      expect(reminderQueueService.cancelAppointmentReminder).toHaveBeenCalledWith(
        SLOT_ID,
      );
    });
  });

  describe('findAll', () => {
    it('returns an empty array immediately when the patient has no appointments', async () => {
      const { service, appointmentModel } = buildService();
      appointmentModel.find.mockReturnValue({
        sort: jest
          .fn()
          .mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
      });

      const result = await service.findAll(USER_ID);
      expect(result).toEqual([]);
    });
  });
});
