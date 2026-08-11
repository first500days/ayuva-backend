import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { MedicationsService } from './medications.service';
import { MedicationLogStatus } from './schemas/medication-log.schema';

function buildService() {
  const medicationModel = {
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };
  const medicationLogModel = {
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };
  const reminderQueueService = {
    scheduleMedicationReminders: jest.fn(),
    cancelMedicationReminders: jest.fn(),
    rescheduleMedicationReminders: jest.fn(),
    sendRefillReminder: jest.fn(),
  };
  const service = new MedicationsService(
    medicationModel as any,
    medicationLogModel as any,
    reminderQueueService as any,
  );
  return { service, medicationModel, medicationLogModel, reminderQueueService };
}

const USER_ID = new Types.ObjectId().toString();
const MEDICATION_ID = new Types.ObjectId().toString();

describe('MedicationsService', () => {
  describe('getToday', () => {
    it('returns an empty, zero-percent adherence payload when there are no active medications (no error)', async () => {
      const { service, medicationModel } = buildService();
      medicationModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      });

      const result = await service.getToday(USER_ID);

      expect(result).toEqual({
        items: [],
        adherence: { takenCount: 0, totalCount: 0, percent: 0 },
      });
    });
  });

  describe('logDose', () => {
    it('throws NotFoundException for a syntactically invalid medication id', async () => {
      const { service } = buildService();
      await expect(
        service.logDose(USER_ID, 'not-an-object-id', {
          scheduledAt: new Date().toISOString(),
          status: MedicationLogStatus.TAKEN,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when the medication does not belong to the caller', async () => {
      const { service, medicationModel } = buildService();
      medicationModel.findOne.mockResolvedValue(null);

      await expect(
        service.logDose(USER_ID, MEDICATION_ID, {
          scheduledAt: new Date().toISOString(),
          status: MedicationLogStatus.TAKEN,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException for an unparseable scheduledAt', async () => {
      const { service, medicationModel } = buildService();
      medicationModel.findOne.mockResolvedValue({ id: MEDICATION_ID });

      await expect(
        service.logDose(USER_ID, MEDICATION_ID, {
          scheduledAt: 'not-a-date',
          status: MedicationLogStatus.TAKEN,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('decrements suppliesRemainingDays only on a genuine transition into "taken"', async () => {
      const { service, medicationModel, medicationLogModel } = buildService();
      medicationModel.findOne.mockResolvedValue({ id: MEDICATION_ID });
      medicationModel.findOneAndUpdate.mockResolvedValue({
        id: MEDICATION_ID,
        name: 'Amlodipine',
        suppliesRemainingDays: 10,
        refillThresholdDays: 3,
      });
      medicationLogModel.findOne.mockResolvedValue({
        status: MedicationLogStatus.UPCOMING,
      });
      medicationLogModel.findOneAndUpdate.mockResolvedValue({
        id: 'log-1',
        medicationId: { toString: () => MEDICATION_ID },
        scheduledAt: new Date(),
        status: MedicationLogStatus.TAKEN,
      });

      await service.logDose(USER_ID, MEDICATION_ID, {
        scheduledAt: new Date().toISOString(),
        status: MedicationLogStatus.TAKEN,
      });

      expect(medicationModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ suppliesRemainingDays: { $gt: 0 } }),
        { $inc: { suppliesRemainingDays: -1 } },
        { returnDocument: 'after' },
      );
    });

    it('does not decrement supply again when the dose was already marked taken', async () => {
      const { service, medicationModel, medicationLogModel } = buildService();
      medicationModel.findOne.mockResolvedValue({ id: MEDICATION_ID });
      medicationLogModel.findOne.mockResolvedValue({
        status: MedicationLogStatus.TAKEN,
      });
      medicationLogModel.findOneAndUpdate.mockResolvedValue({
        id: 'log-1',
        medicationId: { toString: () => MEDICATION_ID },
        scheduledAt: new Date(),
        status: MedicationLogStatus.TAKEN,
      });

      await service.logDose(USER_ID, MEDICATION_ID, {
        scheduledAt: new Date().toISOString(),
        status: MedicationLogStatus.TAKEN,
      });

      expect(medicationModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('sends a refill reminder push once supply drops to the refill threshold', async () => {
      const { service, medicationModel, medicationLogModel, reminderQueueService } =
        buildService();
      medicationModel.findOne.mockResolvedValue({ id: MEDICATION_ID });
      medicationModel.findOneAndUpdate.mockResolvedValue({
        id: MEDICATION_ID,
        name: 'Amlodipine',
        suppliesRemainingDays: 3,
        refillThresholdDays: 3,
      });
      medicationLogModel.findOne.mockResolvedValue({
        status: MedicationLogStatus.UPCOMING,
      });
      medicationLogModel.findOneAndUpdate.mockResolvedValue({
        id: 'log-1',
        medicationId: { toString: () => MEDICATION_ID },
        scheduledAt: new Date(),
        status: MedicationLogStatus.TAKEN,
      });

      await service.logDose(USER_ID, MEDICATION_ID, {
        scheduledAt: new Date().toISOString(),
        status: MedicationLogStatus.TAKEN,
      });

      expect(reminderQueueService.sendRefillReminder).toHaveBeenCalledWith({
        medicationId: MEDICATION_ID,
        userId: USER_ID,
        name: 'Amlodipine',
        suppliesRemainingDays: 3,
      });
    });

    it('does not send a refill reminder while supply is still above the threshold', async () => {
      const { service, medicationModel, medicationLogModel, reminderQueueService } =
        buildService();
      medicationModel.findOne.mockResolvedValue({ id: MEDICATION_ID });
      medicationModel.findOneAndUpdate.mockResolvedValue({
        id: MEDICATION_ID,
        name: 'Amlodipine',
        suppliesRemainingDays: 10,
        refillThresholdDays: 3,
      });
      medicationLogModel.findOne.mockResolvedValue({
        status: MedicationLogStatus.UPCOMING,
      });
      medicationLogModel.findOneAndUpdate.mockResolvedValue({
        id: 'log-1',
        medicationId: { toString: () => MEDICATION_ID },
        scheduledAt: new Date(),
        status: MedicationLogStatus.TAKEN,
      });

      await service.logDose(USER_ID, MEDICATION_ID, {
        scheduledAt: new Date().toISOString(),
        status: MedicationLogStatus.TAKEN,
      });

      expect(reminderQueueService.sendRefillReminder).not.toHaveBeenCalled();
    });
  });

  describe('update (FR-10.3 reminder wiring)', () => {
    it('reschedules reminders when the edited medication is active with schedule times', async () => {
      const { service, medicationModel, reminderQueueService } =
        buildService();
      medicationModel.findOne.mockResolvedValue({
        id: MEDICATION_ID,
        name: 'Amlodipine',
        dosage: '5 mg',
        frequency: 'Once daily',
        scheduleTimes: ['08:00'],
        refillThresholdDays: 7,
        active: true,
        save: jest.fn().mockResolvedValue(undefined),
      });

      await service.update(USER_ID, MEDICATION_ID, { dosage: '10 mg' });

      expect(
        reminderQueueService.rescheduleMedicationReminders,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ id: MEDICATION_ID, dosage: '10 mg' }),
      );
      expect(reminderQueueService.cancelMedicationReminders).not.toHaveBeenCalled();
    });

    it('cancels reminders instead of rescheduling when the medication is set inactive', async () => {
      const { service, medicationModel, reminderQueueService } =
        buildService();
      medicationModel.findOne.mockResolvedValue({
        id: MEDICATION_ID,
        name: 'Amlodipine',
        dosage: '5 mg',
        frequency: 'Once daily',
        scheduleTimes: ['08:00'],
        refillThresholdDays: 7,
        active: true,
        save: jest.fn().mockResolvedValue(undefined),
      });

      await service.update(USER_ID, MEDICATION_ID, { active: false });

      expect(reminderQueueService.cancelMedicationReminders).toHaveBeenCalledWith(
        MEDICATION_ID,
      );
      expect(
        reminderQueueService.rescheduleMedicationReminders,
      ).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the medication does not belong to the caller', async () => {
      const { service, medicationModel } = buildService();
      medicationModel.findOne.mockResolvedValue(null);

      await expect(
        service.update(USER_ID, MEDICATION_ID, { dosage: '10 mg' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove (FR-10.3 reminder wiring)', () => {
    it('cancels reminder jobs after deleting the medication — a stale job firing is a real bug', async () => {
      const { service, medicationModel, reminderQueueService } =
        buildService();
      medicationModel.findOne.mockResolvedValue({
        id: MEDICATION_ID,
        deleteOne: jest.fn().mockResolvedValue(undefined),
      });

      await service.remove(USER_ID, MEDICATION_ID);

      expect(reminderQueueService.cancelMedicationReminders).toHaveBeenCalledWith(
        MEDICATION_ID,
      );
    });
  });
});
