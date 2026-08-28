import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppNotification, AppNotificationDocument } from './schemas/app-notification.schema';
import { AppNotificationResponseDto, NotificationPreferencesDto } from './dto/notification-response.dto';

// In-memory prefs store — keeps it simple without a new schema migration.
// A real production app would persist this to a UserPreferences document.
const prefsStore = new Map<string, NotificationPreferencesDto>();

const DEFAULT_PREFS: NotificationPreferencesDto = {
  appointments: true,
  results: true,
  sharing: true,
  medications: true,
  marketing: false,
  hideSensitiveOnLockScreen: true,
};

@Injectable()
export class AppNotificationsService {
  constructor(
    @InjectModel(AppNotification.name)
    private readonly notificationModel: Model<AppNotificationDocument>,
  ) {}

  async list(userId: string): Promise<AppNotificationResponseDto[]> {
    const notifications = await this.notificationModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ occurredAt: -1 })
      .limit(50)
      .exec();
    return notifications.map((n) => this.toResponse(n));
  }

  async markRead(userId: string, id: string): Promise<AppNotificationResponseDto> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Notification not found');
    const notification = await this.notificationModel.findOneAndUpdate(
      { _id: id, userId: new Types.ObjectId(userId) },
      { read: true },
      { new: true },
    );
    if (!notification) throw new NotFoundException('Notification not found');
    return this.toResponse(notification);
  }

  async markAllRead(userId: string): Promise<AppNotificationResponseDto[]> {
    await this.notificationModel.updateMany(
      { userId: new Types.ObjectId(userId), read: false },
      { read: true },
    );
    return this.list(userId);
  }

  getPreferences(userId: string): NotificationPreferencesDto {
    return prefsStore.get(userId) ?? { ...DEFAULT_PREFS };
  }

  updatePreferences(userId: string, prefs: NotificationPreferencesDto): NotificationPreferencesDto {
    prefsStore.set(userId, prefs);
    return prefs;
  }

  /** Called by other services (appointments, records, etc.) to create in-app notifications. */
  async create(
    userId: string,
    data: {
      trigger: string;
      title: string;
      message: string;
      lockScreenText: string;
      actionLabel?: string;
      actionRoute: string;
      actionParams?: Record<string, string>;
    },
  ): Promise<void> {
    await this.notificationModel.create({
      userId: new Types.ObjectId(userId),
      ...data,
      actionLabel: data.actionLabel ?? 'View',
    });
  }

  private toResponse(n: AppNotificationDocument): AppNotificationResponseDto {
    return {
      id: n.id,
      trigger: n.trigger,
      title: n.title,
      message: n.message,
      lockScreenText: n.lockScreenText,
      actionLabel: n.actionLabel,
      actionRoute: n.actionRoute,
      actionParams: n.actionParams,
      occurredAt: (n.occurredAt ?? new Date()).toISOString(),
      read: n.read,
    };
  }
}
