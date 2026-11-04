import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export enum AssetStatus {
  OPERATIONAL = 'operational',
  MAINTENANCE = 'maintenance',
  OUT_OF_SERVICE = 'out_of_service',
  CONDEMNED = 'condemned',
}

export const ASSET_CATEGORIES = [
  'imaging',
  'monitoring',
  'life_support',
  'laboratory',
  'surgical',
  'sterilisation',
  'utility',
  'other',
] as const;

export const MAINTENANCE_TYPES = [
  'preventive',
  'calibration',
  'breakdown',
  'repair',
  'inspection',
] as const;
export type MaintenanceType = (typeof MAINTENANCE_TYPES)[number];

/** One service visit, calibration, breakdown or repair. */
@Schema({ _id: true })
export class MaintenanceLog {
  _id: Types.ObjectId;
  @Prop({ required: true }) at: Date;
  @Prop({ type: String, enum: MAINTENANCE_TYPES, required: true })
  type: MaintenanceType;
  @Prop({ required: true, trim: true }) summary: string;
  @Prop({ trim: true }) vendor?: string;
  @Prop({ trim: true }) engineer?: string;
  @Prop({ min: 0 }) cost?: number;
  @Prop({ min: 0 }) downtimeHours?: number;
  @Prop({ type: String, enum: AssetStatus }) statusAfter?: AssetStatus;
  @Prop() byName?: string;
  @Prop() loggedAt?: Date;
}
export const MaintenanceLogSchema =
  SchemaFactory.createForClass(MaintenanceLog);

export type AssetDocument = HydratedDocument<PartnerAsset>;

/**
 * Hospital equipment register (Central Supply → Equipment): what each
 * machine is, where it is, its warranty / AMC, and its preventive
 * maintenance and calibration schedule with a full service history.
 */
@Schema({ timestamps: true, collection: 'partner_assets' })
export class PartnerAsset {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Provider',
    required: true,
    index: true,
  })
  providerId: Types.ObjectId;

  // Asset tag painted / stuck on the machine.
  @Prop({ required: true, trim: true }) tag: string;
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ type: String, enum: ASSET_CATEGORIES, default: 'other' })
  category: string;
  @Prop({ trim: true }) department?: string;
  @Prop({ trim: true }) location?: string;
  @Prop({ trim: true }) make?: string;
  @Prop({ trim: true }) modelNo?: string;
  @Prop({ trim: true }) serialNo?: string;

  @Prop() purchasedAt?: Date;
  @Prop() warrantyUntil?: Date;
  @Prop({ trim: true }) amcVendor?: string;
  @Prop() amcUntil?: Date;

  // Preventive maintenance every N days (0/empty = not scheduled).
  @Prop({ min: 0 }) serviceIntervalDays?: number;
  @Prop() lastServiceAt?: Date;
  @Prop() nextServiceDue?: Date;

  @Prop({ min: 0 }) calibrationIntervalDays?: number;
  @Prop() lastCalibratedAt?: Date;
  @Prop() nextCalibrationDue?: Date;

  @Prop({
    type: String,
    enum: AssetStatus,
    default: AssetStatus.OPERATIONAL,
    index: true,
  })
  status: AssetStatus;

  @Prop({ type: [MaintenanceLogSchema], default: [] })
  logs: MaintenanceLog[];

  createdAt?: Date;
  updatedAt?: Date;
}

export const PartnerAssetSchema = SchemaFactory.createForClass(PartnerAsset);
PartnerAssetSchema.index({ providerId: 1, tag: 1 }, { unique: true });
