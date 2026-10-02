import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Worker } from 'bullmq';
import type { Job } from 'bullmq';
import { Model } from 'mongoose';
import {
  DeviceToken,
  DeviceTokenDocument,
} from '../schemas/device-token.schema';
import { FCM_SENDER } from '../fcm/fcm-sender.interface';
import type { FcmPayload, FcmSender } from '../fcm/fcm-sender.interface';
import { SMS_SENDER } from '../sms/sms-sender';
import type { SmsSender } from '../sms/sms-sender';
import {
  ReminderJobData,
  ReminderJobName,
  REMINDER_QUEUE_NAME,
} from './reminder-queue.constants';
import { AppNotificationsService, withDefaults } from '../app-notifications.service';
import type { NotificationPreferencesDto } from '../dto/notification-response.dto';
import type { NotificationCategory } from '../schemas/app-notification.schema';
import { User, UserDocument } from '../../core/users/schemas/user.schema';
import { MailService } from '../../mail/mail.service';

type CategoryPref = keyof Pick<
  NotificationPreferencesDto,
  'appointments' | 'results' | 'medications'
>;

/** Per job type: which category switch gates it, and how it shows in the U11 feed. */
const JOB_ROUTING: Record<
  ReminderJobName,
  { pref: CategoryPref; feed?: { category: NotificationCategory; trigger: string } }
> = {
  [ReminderJobName.MEDICATION]: { pref: 'medications' },
  [ReminderJobName.REFILL]: { pref: 'medications' },
  [ReminderJobName.APPOINTMENT]: {
    pref: 'appointments',
    feed: { category: 'appointments', trigger: 'appointment_approaching' },
  },
  [ReminderJobName.FOLLOW_UP]: {
    pref: 'appointments',
    feed: { category: 'appointments', trigger: 'follow_up_due' },
  },
  [ReminderJobName.DOCUMENT_UPLOAD]: {
    pref: 'results',
    feed: { category: 'documents', trigger: 'upload_confirmed' },
  },
};

/**
 * BullMQ consumer (FR-10.3, FR-7.6): pulls due reminder jobs and delivers
 * them per the user's U11 settings — channels (push / email / SMS) and
 * category switches are independent, so muting one never silences another.
 * Appointment reminders, follow-ups and upload confirmations also land in the
 * in-app feed regardless of channel settings: the feed is the record.
 */
@Injectable()
export class ReminderProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReminderProcessor.name);
  private worker?: Worker<ReminderJobData>;

  constructor(
    private readonly config: ConfigService,
    @InjectModel(DeviceToken.name)
    private readonly deviceTokenModel: Model<DeviceTokenDocument>,
    @Inject(FCM_SENDER) private readonly fcmSender: FcmSender,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly appNotifications: AppNotificationsService,
    private readonly mail: MailService,
    @Inject(SMS_SENDER) private readonly smsSender: SmsSender,
  ) {}

  onModuleInit() {
    this.worker = new Worker<ReminderJobData>(
      REMINDER_QUEUE_NAME,
      (job: Job<ReminderJobData>) => this.handle(job),
      {
        connection: {
          host: this.config.get<string>('redis.host'),
          port: this.config.get<number>('redis.port'),
          password: this.config.get<string>('redis.password'),
          maxRetriesPerRequest: null,
        },
      },
    );
    this.worker.on('failed', (job: Job<ReminderJobData> | undefined, err: Error) =>
      this.logger.error(
        `Reminder job ${job?.id ?? '(unknown)'} failed`,
        err as Error,
      ),
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async handle(job: Job<ReminderJobData>): Promise<void> {
    const data = job.data;
    const payload = this.buildPayload(data);
    const routing = JOB_ROUTING[data.type];

    const user = await this.userModel
      .findById(data.userId)
      .select('email phone phoneVerifiedAt notificationPrefs')
      .lean()
      .exec();
    const prefs = withDefaults(user?.notificationPrefs);

    if (routing.feed) {
      await this.appNotifications
        .create(data.userId, {
          trigger: routing.feed.trigger,
          category: routing.feed.category,
          title: payload.title,
          message: payload.body,
          lockScreenText: payload.title,
          ...this.feedAction(data),
        })
        .catch((err: unknown) =>
          this.logger.error(`Feed entry failed for user ${data.userId}`, err as Error),
        );
    }

    if (!prefs[routing.pref]) {
      this.logger.debug(`User ${data.userId} muted ${routing.pref}; skipping ${data.type}`);
      return;
    }

    await Promise.all([
      prefs.push ? this.sendPush(data.userId, payload, prefs) : undefined,
      prefs.email && user?.email && this.isEmailWorthy(data.type)
        ? this.mail
            .sendMail(user.email, payload.title, `<p>${escapeHtml(payload.body)}</p>`)
            .catch((err: unknown) =>
              this.logger.error(`Reminder email failed for user ${data.userId}`, err as Error),
            )
        : undefined,
      // SMS is reminders only, and only to a verified number.
      prefs.sms &&
      data.type === ReminderJobName.APPOINTMENT &&
      user?.phone &&
      user.phoneVerifiedAt
        ? this.smsSender.send(user.phone, `Ayuva: ${payload.body}`)
        : undefined,
    ]);
  }

  private async sendPush(
    userId: string,
    payload: FcmPayload,
    prefs: NotificationPreferencesDto,
  ): Promise<void> {
    const devices = await this.deviceTokenModel.find({ userId }).exec();
    if (devices.length === 0) {
      this.logger.debug(`No registered devices for user ${userId}`);
      return;
    }
    // Lock-screen privacy: send the generic title only when the user asked for it.
    const sent = prefs.hideSensitiveOnLockScreen
      ? { ...payload, body: 'Open Ayuva to see the details' }
      : payload;
    await Promise.all(
      devices.map((device) =>
        this.fcmSender.send(device.token, sent).catch((err: unknown) =>
          this.logger.error(`Push dispatch failed for user ${userId}`, err as Error),
        ),
      ),
    );
  }

  /** Upload confirmations and medication nudges are push/in-app only — email would be noise. */
  private isEmailWorthy(type: ReminderJobName): boolean {
    return type === ReminderJobName.APPOINTMENT || type === ReminderJobName.FOLLOW_UP;
  }

  private feedAction(data: ReminderJobData): {
    actionLabel: string;
    actionRoute: string;
    actionParams?: Record<string, string>;
  } {
    switch (data.type) {
      case ReminderJobName.DOCUMENT_UPLOAD:
        return { actionLabel: 'Open', actionRoute: '/record/[id]', actionParams: { id: data.recordId } };
      case ReminderJobName.FOLLOW_UP:
        return { actionLabel: 'Book follow-up', actionRoute: '/appointments' };
      default:
        return { actionLabel: 'View', actionRoute: '/appointments' };
    }
  }

  private buildPayload(data: ReminderJobData): FcmPayload {
    switch (data.type) {
      case ReminderJobName.MEDICATION:
        return {
          title: 'Time for your medication',
          body: `${data.name} — ${data.dosage}, due at ${data.scheduleTime}`,
          data: { medicationId: data.medicationId, type: data.type },
        };
      case ReminderJobName.APPOINTMENT:
        return {
          title: 'Upcoming appointment reminder',
          body: `Your appointment with ${data.providerName} is coming up at ${data.time}`,
          data: { appointmentId: data.appointmentId, type: data.type },
        };
      case ReminderJobName.REFILL:
        return {
          title: 'Refill reminder',
          body: `${data.name} — only ${data.suppliesRemainingDays} day${data.suppliesRemainingDays === 1 ? '' : 's'} of supply left`,
          data: { medicationId: data.medicationId, type: data.type },
        };
      case ReminderJobName.DOCUMENT_UPLOAD:
        return {
          title: 'Upload confirmed',
          body: `${data.fileName} was added to your Medical Vault`,
          data: { recordId: data.recordId, type: data.type },
        };
      case ReminderJobName.FOLLOW_UP:
        return {
          title: 'Follow-up due',
          body: `How are you feeling after your visit with ${data.providerName}? Check your care journey for next steps.`,
          data: { appointmentId: data.appointmentId, type: data.type },
        };
    }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
