import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { StaffRole } from '../../rbac/partner-permissions';
import { PartnerTrigger } from '../partner-triggers';

/** One row of the Notification Center matrix: a trigger, its channels and who receives it. */
@Schema({ _id: false })
export class PartnerNotificationRule {
  @Prop({ type: String, enum: PartnerTrigger, required: true })
  trigger: PartnerTrigger;

  @Prop({ default: true }) inApp: boolean;
  @Prop({ default: false }) email: boolean;
  @Prop({ default: false }) sms: boolean;
  @Prop({ default: false }) desktop: boolean;
  @Prop({ default: false }) webhook: boolean;

  @Prop({ type: [String], enum: StaffRole, default: [] })
  roles: StaffRole[];
}
export const PartnerNotificationRuleSchema = SchemaFactory.createForClass(
  PartnerNotificationRule,
);

@Schema({ _id: false })
export class PartnerWebhookConfig {
  @Prop({ default: false })
  enabled: boolean;

  @Prop({ trim: true })
  url?: string;

  // HMAC-SHA256 signing secret, shown to the organisation admin so their receiver can verify events.
  @Prop()
  secret?: string;
}
export const PartnerWebhookConfigSchema =
  SchemaFactory.createForClass(PartnerWebhookConfig);

/** Capacity warning rule: alert once occupancy of the scope reaches the threshold. */
@Schema({ _id: false })
export class PartnerCapacityRule {
  @Prop({ required: true }) id: string;
  // One of CAPACITY_SCOPES.
  @Prop({ required: true }) scope: string;
  @Prop({ required: true, min: 1, max: 100 }) thresholdPercent: number;
  @Prop({ default: true }) enabled: boolean;
}
export const PartnerCapacityRuleSchema =
  SchemaFactory.createForClass(PartnerCapacityRule);

/** A rule scope that is over its threshold and has already alerted. */
@Schema({ _id: false })
export class PartnerCapacityAlert {
  @Prop({ required: true }) key: string;
  @Prop({ required: true }) at: Date;
}
export const PartnerCapacityAlertSchema =
  SchemaFactory.createForClass(PartnerCapacityAlert);

export type PartnerNotificationSettingsDocument =
  HydratedDocument<PartnerNotificationSettings>;

/** Per-organisation Notification Center configuration. Absent = catalogue defaults. */
@Schema({ timestamps: true, collection: 'partner_notification_settings' })
export class PartnerNotificationSettings {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Provider',
    required: true,
    unique: true,
  })
  providerId: Types.ObjectId;

  @Prop({ type: [PartnerNotificationRuleSchema], default: [] })
  rules: PartnerNotificationRule[];

  @Prop({ type: PartnerWebhookConfigSchema, default: () => ({}) })
  webhook: PartnerWebhookConfig;

  // Hospitals only. Unset until saved, so the starter templates apply.
  @Prop({ type: [PartnerCapacityRuleSchema], default: undefined })
  capacityRules?: PartnerCapacityRule[];

  // So each crossing alerts once, not on every admission while a ward stays full.
  @Prop({ type: [PartnerCapacityAlertSchema], default: [] })
  capacityAlerts: PartnerCapacityAlert[];
}

export const PartnerNotificationSettingsSchema = SchemaFactory.createForClass(
  PartnerNotificationSettings,
);
