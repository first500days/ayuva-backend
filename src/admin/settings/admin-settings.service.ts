import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SystemSettings, SystemSettingsDocument } from './schemas/system-settings.schema';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';

@Injectable()
export class AdminSettingsService {
  constructor(
    @InjectModel(SystemSettings.name)
    private readonly settingsModel: Model<SystemSettingsDocument>,
    private readonly auditLogService: AuditLogService,
  ) {}

  async getSettings(): Promise<SystemSettings> {
    let settings = await this.settingsModel.findOne().exec();
    if (!settings) {
      settings = await this.settingsModel.create({});
    }
    return settings;
  }

  async updateSettings(update: Partial<SystemSettings>, actorId: string): Promise<SystemSettings> {
    let settings = await this.settingsModel.findOne().exec();
    if (!settings) {
      settings = await this.settingsModel.create(update);
    } else {
      Object.assign(settings, update);
      settings = await settings.save();
    }

    await this.auditLogService.record({
      actorId: actorId as any,
      action: AuditAction.ADMIN_USER_UPDATE,
      targetType: 'SystemSettings',
      metadata: { action: 'system_settings_updated' },
    });

    return settings;
  }

  async updateFeatureFlag(key: string, enabled: boolean, actorId: string): Promise<SystemSettings> {
    const settings = await this.getSettings();
    settings.featureFlags = { ...settings.featureFlags, [key]: enabled };
    await this.settingsModel.updateOne({}, { featureFlags: settings.featureFlags }).exec();

    await this.auditLogService.record({
      actorId: actorId as any,
      action: AuditAction.ADMIN_USER_UPDATE,
      targetType: 'FeatureFlag',
      metadata: { key, enabled },
    });

    return this.getSettings();
  }

  async updateTemplate(id: string, tplUpdate: { subject: string; body: string }, actorId: string): Promise<SystemSettings> {
    const settings = await this.getSettings();
    const tpls = settings.notificationTemplates.map((t) => (t.id === id ? { ...t, ...tplUpdate } : t));
    await this.settingsModel.updateOne({}, { notificationTemplates: tpls }).exec();

    await this.auditLogService.record({
      actorId: actorId as any,
      action: AuditAction.ADMIN_USER_UPDATE,
      targetType: 'NotificationTemplate',
      metadata: { templateId: id },
    });

    return this.getSettings();
  }
}
