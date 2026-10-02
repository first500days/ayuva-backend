import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AppNotification,
  AppNotificationDocument,
  NotificationCategory,
} from './schemas/app-notification.schema';
import {
  AppNotificationResponseDto,
  NotificationPreferencesDto,
  UpdateNotificationPreferencesDto,
} from './dto/notification-response.dto';
import {
  User,
  UserDocument,
  UserRole,
  UserStatus,
} from '../core/users/schemas/user.schema';

export const DEFAULT_NOTIFICATION_PREFS: NotificationPreferencesDto = {
  push: true,
  email: true,
  sms: false,
  appointments: true,
  results: true,
  sharing: true,
  medications: true,
  family: true,
  marketing: false,
  hideSensitiveOnLockScreen: true,
};

@Injectable()
export class AppNotificationsService {
  constructor(
    @InjectModel(AppNotification.name)
    private readonly notificationModel: Model<AppNotificationDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  /** U11 feed; `category` is the filter tab (omit for All). */
  async list(
    userId: string,
    category?: NotificationCategory,
  ): Promise<AppNotificationResponseDto[]> {
    const notifications = await this.notificationModel
      .find({
        userId: new Types.ObjectId(userId),
        ...(category && { category }),
      })
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

  async getPreferences(userId: string): Promise<NotificationPreferencesDto> {
    const user = await this.userModel
      .findById(userId)
      .select('notificationPrefs')
      .lean()
      .exec();
    return withDefaults(user?.notificationPrefs);
  }

  /** Partial update: only the switches sent change. */
  async updatePreferences(
    userId: string,
    patch: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferencesDto> {
    const current = await this.getPreferences(userId);
    const next = { ...current, ...stripUndefined(patch) };
    await this.userModel.updateOne(
      { _id: userId },
      { $set: { notificationPrefs: next } },
    );
    return next;
  }

  /** Called by other services (appointments, records, sharing, family) to create in-app notifications. */
  async create(
    userId: string,
    data: {
      trigger: string;
      category?: NotificationCategory;
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
      category: data.category ?? 'general',
      actionLabel: data.actionLabel ?? 'View',
    });
  }

  /** Fans one in-app notification out to every active admin (e.g. a partner awaiting verification). */
  async notifyAdmins(data: Parameters<AppNotificationsService['create']>[1]): Promise<void> {
    const admins = await this.userModel
      .find({ role: UserRole.ADMIN, status: UserStatus.ACTIVE })
      .select('_id')
      .lean()
      .exec();
    if (!admins.length) return;
    await this.notificationModel.insertMany(
      admins.map((a) => ({
        userId: a._id,
        ...data,
        category: data.category ?? 'general',
        actionLabel: data.actionLabel ?? 'View',
      })),
    );
  }

  private toResponse(n: AppNotificationDocument): AppNotificationResponseDto {
    return {
      id: n.id,
      trigger: n.trigger,
      category: n.category ?? 'general',
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

export function withDefaults(
  stored?: Partial<NotificationPreferencesDto> | null,
): NotificationPreferencesDto {
  return { ...DEFAULT_NOTIFICATION_PREFS, ...stripUndefined(stored ?? {}) };
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null),
  ) as Partial<T>;
}
