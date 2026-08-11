import { ReminderJobName } from './reminder-queue.constants';

let capturedProcessor: ((job: any) => Promise<void>) | undefined;

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation((_name: string, processor: any) => {
    capturedProcessor = processor;
    return { on: jest.fn(), close: jest.fn() };
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ReminderProcessor } = require('./reminder.processor');

function buildProcessor() {
  const deviceTokenModel = { find: jest.fn() };
  const fcmSender = { send: jest.fn().mockResolvedValue(undefined) };
  const config = { get: jest.fn() };
  const processor = new ReminderProcessor(
    config as any,
    deviceTokenModel as any,
    fcmSender as any,
  );
  processor.onModuleInit();
  return { processor, deviceTokenModel, fcmSender };
}

describe('ReminderProcessor (BullMQ consumer)', () => {
  it('dispatches a medication reminder to every registered device token', async () => {
    const { deviceTokenModel, fcmSender } = buildProcessor();
    deviceTokenModel.find.mockReturnValue({
      exec: jest.fn().mockResolvedValue([{ token: 'tok-1' }, { token: 'tok-2' }]),
    });

    await capturedProcessor!({
      data: {
        type: ReminderJobName.MEDICATION,
        medicationId: 'med-1',
        userId: 'user-1',
        name: 'Amlodipine',
        dosage: '5 mg',
        scheduleTime: '08:00',
      },
    });

    expect(fcmSender.send).toHaveBeenCalledTimes(2);
    expect(fcmSender.send).toHaveBeenCalledWith(
      'tok-1',
      expect.objectContaining({ title: expect.stringContaining('medication') }),
    );
  });

  it('dispatches an appointment reminder with the right copy', async () => {
    const { deviceTokenModel, fcmSender } = buildProcessor();
    deviceTokenModel.find.mockReturnValue({
      exec: jest.fn().mockResolvedValue([{ token: 'tok-1' }]),
    });

    await capturedProcessor!({
      data: {
        type: ReminderJobName.APPOINTMENT,
        appointmentId: 'appt-1',
        userId: 'user-1',
        providerName: 'Dr. Menon',
        date: '2026-08-14',
        time: '10:30',
      },
    });

    expect(fcmSender.send).toHaveBeenCalledWith(
      'tok-1',
      expect.objectContaining({ body: expect.stringContaining('Dr. Menon') }),
    );
  });

  it('dispatches a refill reminder with the supply count in the copy', async () => {
    const { deviceTokenModel, fcmSender } = buildProcessor();
    deviceTokenModel.find.mockReturnValue({
      exec: jest.fn().mockResolvedValue([{ token: 'tok-1' }]),
    });

    await capturedProcessor!({
      data: {
        type: ReminderJobName.REFILL,
        medicationId: 'med-1',
        userId: 'user-1',
        name: 'Amlodipine',
        suppliesRemainingDays: 2,
      },
    });

    expect(fcmSender.send).toHaveBeenCalledWith(
      'tok-1',
      expect.objectContaining({ body: expect.stringContaining('2 days') }),
    );
  });

  it('dispatches a document-upload-confirmation with the file name in the copy', async () => {
    const { deviceTokenModel, fcmSender } = buildProcessor();
    deviceTokenModel.find.mockReturnValue({
      exec: jest.fn().mockResolvedValue([{ token: 'tok-1' }]),
    });

    await capturedProcessor!({
      data: {
        type: ReminderJobName.DOCUMENT_UPLOAD,
        recordId: 'rec-1',
        userId: 'user-1',
        fileName: 'lipid-panel.pdf',
      },
    });

    expect(fcmSender.send).toHaveBeenCalledWith(
      'tok-1',
      expect.objectContaining({ body: expect.stringContaining('lipid-panel.pdf') }),
    );
  });

  it('dispatches a follow-up reminder with the provider name in the copy', async () => {
    const { deviceTokenModel, fcmSender } = buildProcessor();
    deviceTokenModel.find.mockReturnValue({
      exec: jest.fn().mockResolvedValue([{ token: 'tok-1' }]),
    });

    await capturedProcessor!({
      data: {
        type: ReminderJobName.FOLLOW_UP,
        appointmentId: 'appt-1',
        userId: 'user-1',
        providerName: 'Dr. Menon',
      },
    });

    expect(fcmSender.send).toHaveBeenCalledWith(
      'tok-1',
      expect.objectContaining({ body: expect.stringContaining('Dr. Menon') }),
    );
  });

  it('is a no-op (no FCM calls) when the user has no registered devices', async () => {
    const { deviceTokenModel, fcmSender } = buildProcessor();
    deviceTokenModel.find.mockReturnValue({
      exec: jest.fn().mockResolvedValue([]),
    });

    await capturedProcessor!({
      data: {
        type: ReminderJobName.MEDICATION,
        medicationId: 'med-1',
        userId: 'user-1',
        name: 'Amlodipine',
        dosage: '5 mg',
        scheduleTime: '08:00',
      },
    });

    expect(fcmSender.send).not.toHaveBeenCalled();
  });
});
