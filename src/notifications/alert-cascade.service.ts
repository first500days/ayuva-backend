import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../core/users/schemas/user.schema';
import { CASCADE_STEP_MS, OUTSIDE_APP_TEXT, nextStep } from './alert-cascade';
import { withDefaults } from './app-notifications.service';
import {
  AppNotification,
  AppNotificationDocument,
} from './schemas/app-notification.schema';
import { SMS_SENDER, type SmsSender } from './sms/sms-sender';
import { WHATSAPP_SENDER, type WhatsAppSender } from './sms/whatsapp-sender';

const SWEEP_MS = 30_000;
/** Older unread alerts are left alone (the cascade is for things happening now). */
const MAX_AGE_MS = 2 * 60 * 60_000;

/**
 * Moves unread alerts down the cascade: WhatsApp 3 minutes after the push (at
 * once if there was no device to push to), SMS 3 minutes after that. Each
 * step is claimed once, so several API instances don't double-send, and each
 * follows the person's channel settings and a verified phone number.
 */
@Injectable()
export class AlertCascadeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AlertCascadeService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @InjectModel(AppNotification.name)
    private readonly notificationModel: Model<AppNotificationDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @Inject(WHATSAPP_SENDER) private readonly whatsapp: WhatsAppSender,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.sweep(), SWEEP_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async sweep(now = new Date()): Promise<number> {
    let moved = 0;
    try {
      const candidates = await this.notificationModel
        .find({
          'delivery.cascade': true,
          read: false,
          occurredAt: { $gte: new Date(now.getTime() - MAX_AGE_MS) },
          $or: [
            { 'delivery.whatsappAt': { $exists: false } },
            { 'delivery.smsAt': { $exists: false } },
          ],
        })
        .limit(200)
        .exec();
      for (const n of candidates) {
        const step = nextStep(
          {
            createdAt: n.occurredAt ?? now,
            read: n.read,
            pushDevices: n.delivery?.pushDevices ?? null,
            whatsappAt: n.delivery?.whatsappAt ?? null,
            smsAt: n.delivery?.smsAt ?? null,
          },
          now,
        );
        if (!step) continue;
        const field =
          step === 'whatsapp' ? 'delivery.whatsappAt' : 'delivery.smsAt';
        const claim = await this.notificationModel
          .updateOne(
            { _id: n._id, read: false, [field]: { $exists: false } },
            { $set: { [field]: now } },
          )
          .exec();
        if (claim.modifiedCount !== 1) continue;
        const sent = await this.send(n.userId.toString(), step);
        await this.notificationModel
          .updateOne(
            { _id: n._id },
            { $set: { [`delivery.${step}Sent`]: sent } },
          )
          .exec();
        moved++;
      }
    } catch (err) {
      this.logger.debug(`cascade sweep failed: ${String(err)}`);
    }
    return moved;
  }

  /** Sends the step if the person allows that channel and has a verified number. */
  private async send(
    userId: string,
    step: 'whatsapp' | 'sms',
  ): Promise<boolean> {
    const user = await this.userModel
      .findById(userId)
      .select('phone phoneVerifiedAt notificationPrefs')
      .lean()
      .exec();
    const prefs = withDefaults(user?.notificationPrefs);
    if (!user?.phone || !user.phoneVerifiedAt) return false;
    if (step === 'whatsapp' && !prefs.whatsapp) return false;
    if (step === 'sms' && !prefs.sms) return false;
    try {
      return step === 'whatsapp'
        ? await this.whatsapp.send(user.phone, OUTSIDE_APP_TEXT)
        : await this.sms.send(user.phone, OUTSIDE_APP_TEXT);
    } catch (err) {
      this.logger.warn(`cascade ${step} failed for ${userId}: ${String(err)}`);
      return false;
    }
  }
}

export { CASCADE_STEP_MS };
