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
import {
  ReminderJobData,
  ReminderJobName,
  REMINDER_QUEUE_NAME,
} from './reminder-queue.constants';

/** BullMQ consumer (FR-10.3, FR-7.6): pulls due reminder jobs and dispatches
 * push notifications to every device token registered for that user. */
@Injectable()
export class ReminderProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReminderProcessor.name);
  private worker?: Worker<ReminderJobData>;

  constructor(
    private readonly config: ConfigService,
    @InjectModel(DeviceToken.name)
    private readonly deviceTokenModel: Model<DeviceTokenDocument>,
    @Inject(FCM_SENDER) private readonly fcmSender: FcmSender,
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

    const devices = await this.deviceTokenModel
      .find({ userId: data.userId })
      .exec();
    if (devices.length === 0) {
      this.logger.debug(`No registered devices for user ${data.userId}`);
      return;
    }

    await Promise.all(
      devices.map((device) =>
        this.fcmSender.send(device.token, payload).catch((err: unknown) =>
          this.logger.error(
            `Push dispatch failed for user ${data.userId}`,
            err as Error,
          ),
        ),
      ),
    );
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
          title: 'Document uploaded',
          body: `${data.fileName} was uploaded to your medical record vault`,
          data: { recordId: data.recordId, type: data.type },
        };
      case ReminderJobName.FOLLOW_UP:
        return {
          title: 'Follow-up reminder',
          body: `How are you feeling after your visit with ${data.providerName}? Check your care journey for next steps.`,
          data: { appointmentId: data.appointmentId, type: data.type },
        };
    }
  }
}
