import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type MonitorDocument = HydratedDocument<PartnerMonitor>;

/** A bedside monitor or wearable gateway, and the bed it is attached to. */
@Schema({ timestamps: true, collection: 'partner_monitors' })
export class PartnerMonitor {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Provider',
    required: true,
    index: true,
  })
  providerId: Types.ObjectId;

  @Prop({ required: true, trim: true }) name: string;

  // Only a hash is kept; the key itself is shown once.
  @Prop({ required: true, unique: true }) keyHash: string;
  @Prop({ required: true }) keyHint: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Ward' }) wardId?: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId }) bedId?: Types.ObjectId;

  @Prop({ default: true }) active: boolean;
  @Prop() lastSeenAt?: Date;

  createdAt?: Date;
}
export const PartnerMonitorSchema =
  SchemaFactory.createForClass(PartnerMonitor);

export type VitalDocument = HydratedDocument<PartnerVital>;

/** One set of observations: a monitor's minute, or what a nurse charted. */
@Schema({ collection: 'partner_vitals' })
export class PartnerVital {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Provider', required: true })
  providerId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'PartnerAdmission', required: true })
  admissionId: Types.ObjectId;

  @Prop({ required: true }) at: Date;
  @Prop() hr?: number;
  @Prop() spo2?: number;
  @Prop() rr?: number;
  @Prop() systolic?: number;
  @Prop() diastolic?: number;
  @Prop() tempC?: number;
  // A, C, V, P or U.
  @Prop() avpu?: string;
  @Prop() onOxygen?: boolean;
  @Prop({ required: true, enum: ['monitor', 'manual'] }) source: string;
  @Prop() byName?: string;
}
export const PartnerVitalSchema = SchemaFactory.createForClass(PartnerVital);
PartnerVitalSchema.index({ admissionId: 1, at: -1 });
