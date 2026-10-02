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

function buildProcessor(
  user: Record<string, unknown> | null = {
    email: 'pat@example.com',
    notificationPrefs: { hideSensitiveOnLockScreen: false },
  },
) {
  const deviceTokenModel = { find: jest.fn() };
  const fcmSender = { send: jest.fn().mockResolvedValue(undefined) };
  const config = { get: jest.fn() };
  const userModel = {
    findById: jest.fn().mockReturnValue({
      select: () => ({ lean: () => ({ exec: () => Promise.resolve(user) }) }),
    }),
  };
  const appNotifications = { create: jest.fn().mockResolvedValue(undefined) };
  const mail = { sendMail: jest.fn().mockResolvedValue(true) };
  const smsSender = { send: jest.fn().mockResolvedValue(true) };
  const processor = new ReminderProcessor(
    config as any,
    deviceTokenModel as any,
    fcmSender as any,
    userModel as any,
    appNotifications as any,
    mail as any,
    smsSender as any,
  );
  processor.onModuleInit();
  return { processor, deviceTokenModel, fcmSender, appNotifications, mail, smsSender };
}

const APPOINTMENT_JOB = {
  data: {
    type: ReminderJobName.APPOINTMENT,
    appointmentId: 'appt-1',
    userId: 'user-1',
    providerName: 'Dr. Menon',
    date: '2026-08-14',
    time: '10:30',
  },
};

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

  describe('U11 channel and category settings', () => {
    function withDevice(deviceTokenModel: { find: jest.Mock }) {
      deviceTokenModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([{ token: 'tok-1' }]),
      });
    }

    it('records appointment reminders in the in-app feed under Appointments', async () => {
      const { deviceTokenModel, appNotifications } = buildProcessor();
      withDevice(deviceTokenModel);

      await capturedProcessor!(APPOINTMENT_JOB);

      expect(appNotifications.create).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          category: 'appointments',
          trigger: 'appointment_approaching',
        }),
      );
    });

    it('keeps the feed entry but sends nothing when the category is muted', async () => {
      const { deviceTokenModel, fcmSender, mail, appNotifications } = buildProcessor({
        email: 'pat@example.com',
        notificationPrefs: { appointments: false },
      });
      withDevice(deviceTokenModel);

      await capturedProcessor!(APPOINTMENT_JOB);

      expect(appNotifications.create).toHaveBeenCalled();
      expect(fcmSender.send).not.toHaveBeenCalled();
      expect(mail.sendMail).not.toHaveBeenCalled();
    });

    it('still emails a reminder when push is off — channels are independent', async () => {
      const { deviceTokenModel, fcmSender, mail } = buildProcessor({
        email: 'pat@example.com',
        notificationPrefs: { push: false },
      });
      withDevice(deviceTokenModel);

      await capturedProcessor!(APPOINTMENT_JOB);

      expect(fcmSender.send).not.toHaveBeenCalled();
      expect(mail.sendMail).toHaveBeenCalledWith(
        'pat@example.com',
        'Upcoming appointment reminder',
        expect.stringContaining('Dr. Menon'),
      );
    });

    it('texts appointment reminders only to a verified number with SMS on', async () => {
      const verified = buildProcessor({
        phone: '+919800000000',
        phoneVerifiedAt: new Date(),
        notificationPrefs: { sms: true },
      });
      withDevice(verified.deviceTokenModel);
      await capturedProcessor!(APPOINTMENT_JOB);
      expect(verified.smsSender.send).toHaveBeenCalledWith(
        '+919800000000',
        expect.stringContaining('Dr. Menon'),
      );

      const unverified = buildProcessor({
        phone: '+919800000000',
        notificationPrefs: { sms: true },
      });
      withDevice(unverified.deviceTokenModel);
      await capturedProcessor!(APPOINTMENT_JOB);
      expect(unverified.smsSender.send).not.toHaveBeenCalled();
    });

    it('hides the detail on the lock screen by default', async () => {
      const { deviceTokenModel, fcmSender } = buildProcessor({});
      withDevice(deviceTokenModel);

      await capturedProcessor!(APPOINTMENT_JOB);

      expect(fcmSender.send).toHaveBeenCalledWith(
        'tok-1',
        expect.objectContaining({ body: expect.not.stringContaining('Dr. Menon') }),
      );
    });
  });
});
