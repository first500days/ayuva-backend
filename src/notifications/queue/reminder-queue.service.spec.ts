import { ReminderQueueService } from './reminder-queue.service';
import {
  appointmentReminderJobId,
  documentUploadJobId,
  followUpReminderJobId,
  medicationReminderJobId,
  refillReminderJobId,
} from './reminder-queue.constants';

function buildService(configOverrides: Record<string, unknown> = {}) {
  const queue = {
    upsertJobScheduler: jest.fn(),
    getJobSchedulers: jest.fn().mockResolvedValue([]),
    removeJobScheduler: jest.fn().mockResolvedValue(true),
    add: jest.fn(),
    getJob: jest.fn(),
  };
  const config = {
    get: jest.fn((key: string) => configOverrides[key]),
  };
  const service = new ReminderQueueService(queue as any, config as any);
  return { service, queue, config };
}

const MEDICATION_ID = 'med-1';
const USER_ID = 'user-1';

describe('ReminderQueueService', () => {
  describe('scheduleMedicationReminders (FR-10.3)', () => {
    it('upserts one job scheduler per scheduleTime, keyed by a stable id', async () => {
      const { service, queue } = buildService();

      await service.scheduleMedicationReminders({
        id: MEDICATION_ID,
        userId: USER_ID,
        name: 'Amlodipine',
        dosage: '5 mg',
        scheduleTimes: ['08:00', '20:00'],
      });

      expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(2);
      expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
        medicationReminderJobId(MEDICATION_ID, '08:00'),
        { pattern: '0 8 * * *' },
        expect.objectContaining({
          data: expect.objectContaining({ scheduleTime: '08:00' }),
        }),
      );
      expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
        medicationReminderJobId(MEDICATION_ID, '20:00'),
        { pattern: '0 20 * * *' },
        expect.objectContaining({
          data: expect.objectContaining({ scheduleTime: '20:00' }),
        }),
      );
    });

    it('skips scheduleTimes that do not parse as HH:mm', async () => {
      const { service, queue } = buildService();

      await service.scheduleMedicationReminders({
        id: MEDICATION_ID,
        userId: USER_ID,
        name: 'Amlodipine',
        dosage: '5 mg',
        scheduleTimes: ['not-a-time'],
      });

      expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
    });
  });

  describe('cancelMedicationReminders', () => {
    it('removes only the job schedulers belonging to this medication', async () => {
      const { service, queue } = buildService();
      queue.getJobSchedulers.mockResolvedValue([
        { id: medicationReminderJobId(MEDICATION_ID, '08:00') },
        { id: medicationReminderJobId(MEDICATION_ID, '20:00') },
        { id: medicationReminderJobId('other-med', '08:00') },
      ]);

      await service.cancelMedicationReminders(MEDICATION_ID);

      expect(queue.removeJobScheduler).toHaveBeenCalledTimes(2);
      expect(queue.removeJobScheduler).toHaveBeenCalledWith(
        medicationReminderJobId(MEDICATION_ID, '08:00'),
      );
      expect(queue.removeJobScheduler).toHaveBeenCalledWith(
        medicationReminderJobId(MEDICATION_ID, '20:00'),
      );
      expect(queue.removeJobScheduler).not.toHaveBeenCalledWith(
        medicationReminderJobId('other-med', '08:00'),
      );
    });

    it('does nothing when there are no matching schedulers', async () => {
      const { service, queue } = buildService();
      queue.getJobSchedulers.mockResolvedValue([]);

      await service.cancelMedicationReminders(MEDICATION_ID);

      expect(queue.removeJobScheduler).not.toHaveBeenCalled();
    });
  });

  describe('rescheduleMedicationReminders', () => {
    it('cancels existing schedulers then re-adds when scheduleTimes is non-empty', async () => {
      const { service, queue } = buildService();
      queue.getJobSchedulers.mockResolvedValue([
        { id: medicationReminderJobId(MEDICATION_ID, '08:00') },
      ]);

      await service.rescheduleMedicationReminders({
        id: MEDICATION_ID,
        userId: USER_ID,
        name: 'Amlodipine',
        dosage: '10 mg',
        scheduleTimes: ['09:00'],
      });

      expect(queue.removeJobScheduler).toHaveBeenCalledWith(
        medicationReminderJobId(MEDICATION_ID, '08:00'),
      );
      expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
        medicationReminderJobId(MEDICATION_ID, '09:00'),
        { pattern: '0 9 * * *' },
        expect.anything(),
      );
    });

    it('only cancels, without re-adding, when scheduleTimes is empty', async () => {
      const { service, queue } = buildService();
      queue.getJobSchedulers.mockResolvedValue([]);

      await service.rescheduleMedicationReminders({
        id: MEDICATION_ID,
        userId: USER_ID,
        name: 'Amlodipine',
        dosage: '10 mg',
        scheduleTimes: [],
      });

      expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
    });
  });

  describe('scheduleAppointmentReminder (FR-7.6)', () => {
    it('adds a one-off delayed job at leadMinutes before the slot', async () => {
      const { service, queue } = buildService({
        'reminders.appointmentLeadMinutes': 60,
      });
      const slotAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const date = slotAt.toISOString().slice(0, 10);
      const time = `${String(slotAt.getHours()).padStart(2, '0')}:${String(slotAt.getMinutes()).padStart(2, '0')}`;

      await service.scheduleAppointmentReminder({
        id: 'appt-1',
        userId: USER_ID,
        providerName: 'Dr. Menon',
        date,
        time,
      });

      expect(queue.add).toHaveBeenCalledWith(
        'appointment-reminder',
        expect.objectContaining({ appointmentId: 'appt-1' }),
        expect.objectContaining({
          jobId: appointmentReminderJobId('appt-1'),
          delay: expect.any(Number),
        }),
      );
      const [, , opts] = queue.add.mock.calls[0];
      expect(opts.delay).toBeGreaterThan(0);
    });

    it('does not schedule when the reminder moment has already passed', async () => {
      const { service, queue } = buildService({
        'reminders.appointmentLeadMinutes': 60,
      });
      const pastSlot = new Date(Date.now() - 60 * 60 * 1000);
      const date = pastSlot.toISOString().slice(0, 10);
      const time = `${String(pastSlot.getHours()).padStart(2, '0')}:${String(pastSlot.getMinutes()).padStart(2, '0')}`;

      await service.scheduleAppointmentReminder({
        id: 'appt-2',
        userId: USER_ID,
        providerName: 'Dr. Menon',
        date,
        time,
      });

      expect(queue.add).not.toHaveBeenCalled();
    });
  });

  describe('cancelAppointmentReminder', () => {
    it('removes the pending job when found', async () => {
      const { service, queue } = buildService();
      const remove = jest.fn().mockResolvedValue(undefined);
      queue.getJob.mockResolvedValue({ remove });

      await service.cancelAppointmentReminder('appt-1');

      expect(queue.getJob).toHaveBeenCalledWith(
        appointmentReminderJobId('appt-1'),
      );
      expect(remove).toHaveBeenCalled();
    });

    it('is a no-op when there is no pending job (already fired or never scheduled)', async () => {
      const { service, queue } = buildService();
      queue.getJob.mockResolvedValue(null);

      await expect(
        service.cancelAppointmentReminder('appt-1'),
      ).resolves.toBeUndefined();
    });
  });

  describe('sendRefillReminder', () => {
    it('adds an immediate job deduped by medicationId+today', async () => {
      const { service, queue } = buildService();
      const today = new Date().toISOString().slice(0, 10);

      await service.sendRefillReminder({
        medicationId: MEDICATION_ID,
        userId: USER_ID,
        name: 'Amlodipine',
        suppliesRemainingDays: 2,
      });

      expect(queue.add).toHaveBeenCalledWith(
        'refill-reminder',
        expect.objectContaining({
          medicationId: MEDICATION_ID,
          suppliesRemainingDays: 2,
        }),
        expect.objectContaining({
          jobId: refillReminderJobId(MEDICATION_ID, today),
        }),
      );
    });
  });

  describe('sendDocumentUploadConfirmation', () => {
    it('adds an immediate job keyed by recordId', async () => {
      const { service, queue } = buildService();

      await service.sendDocumentUploadConfirmation({
        recordId: 'rec-1',
        userId: USER_ID,
        fileName: 'lipid-panel.pdf',
      });

      expect(queue.add).toHaveBeenCalledWith(
        'document-upload-confirmation',
        expect.objectContaining({ recordId: 'rec-1', fileName: 'lipid-panel.pdf' }),
        expect.objectContaining({ jobId: documentUploadJobId('rec-1') }),
      );
    });
  });

  describe('scheduleFollowUpReminder', () => {
    it('adds a one-off delayed job followUpLeadDays after the visit', async () => {
      const { service, queue } = buildService({
        'reminders.followUpLeadDays': 3,
      });
      const slotAt = new Date(Date.now() + 60 * 60 * 1000);
      const date = slotAt.toISOString().slice(0, 10);
      const time = `${String(slotAt.getHours()).padStart(2, '0')}:${String(slotAt.getMinutes()).padStart(2, '0')}`;

      await service.scheduleFollowUpReminder({
        id: 'appt-1',
        userId: USER_ID,
        providerName: 'Dr. Menon',
        date,
        time,
      });

      expect(queue.add).toHaveBeenCalledWith(
        'follow-up-reminder',
        expect.objectContaining({ appointmentId: 'appt-1' }),
        expect.objectContaining({
          jobId: followUpReminderJobId('appt-1'),
          delay: expect.any(Number),
        }),
      );
      const call = queue.add.mock.calls.find((c: unknown[]) => c[0] === 'follow-up-reminder');
      expect(call?.[2].delay).toBeGreaterThan(0);
    });

    it('does not schedule when the follow-up moment has already passed', async () => {
      const { service, queue } = buildService({
        'reminders.followUpLeadDays': 3,
      });
      const pastSlot = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      const date = pastSlot.toISOString().slice(0, 10);
      const time = `${String(pastSlot.getHours()).padStart(2, '0')}:${String(pastSlot.getMinutes()).padStart(2, '0')}`;

      await service.scheduleFollowUpReminder({
        id: 'appt-2',
        userId: USER_ID,
        providerName: 'Dr. Menon',
        date,
        time,
      });

      expect(queue.add).not.toHaveBeenCalled();
    });
  });

  describe('cancelFollowUpReminder', () => {
    it('removes the pending job when found', async () => {
      const { service, queue } = buildService();
      const remove = jest.fn().mockResolvedValue(undefined);
      queue.getJob.mockResolvedValue({ remove });

      await service.cancelFollowUpReminder('appt-1');

      expect(queue.getJob).toHaveBeenCalledWith(followUpReminderJobId('appt-1'));
      expect(remove).toHaveBeenCalled();
    });

    it('is a no-op when there is no pending job', async () => {
      const { service, queue } = buildService();
      queue.getJob.mockResolvedValue(null);

      await expect(
        service.cancelFollowUpReminder('appt-1'),
      ).resolves.toBeUndefined();
    });
  });
});
