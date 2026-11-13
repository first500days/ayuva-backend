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

/** Where a tracked asset was last picked up by a BLE / RFID gateway. */
@Schema({ _id: false })
export class AssetSighting {
  @Prop({ required: true }) at: Date;
  /** The gateway's room or area, e.g. "ICU bay 2". */
  @Prop({ required: true }) zone: string;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'PartnerTrackingGateway' })
  gatewayId: Types.ObjectId;
  /** Signal strength in dBm (closer to 0 = nearer), when the gateway reports it. */
  @Prop() rssi?: number;
}
export const AssetSightingSchema = SchemaFactory.createForClass(AssetSighting);

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

  // BLE beacon id / MAC or RFID EPC stuck on the machine, upper case.
  @Prop({ trim: true, uppercase: true }) trackerTag?: string;
  @Prop({ type: AssetSightingSchema }) lastSeen?: AssetSighting;

  createdAt?: Date;
  updatedAt?: Date;
}

export const PartnerAssetSchema = SchemaFactory.createForClass(PartnerAsset);
PartnerAssetSchema.index({ providerId: 1, tag: 1 }, { unique: true });
PartnerAssetSchema.index(
  { providerId: 1, trackerTag: 1 },
  {
    unique: true,
    partialFilterExpression: { trackerTag: { $type: 'string' } },
  },
);

export type TrackingGatewayDocument = HydratedDocument<PartnerTrackingGateway>;

/**
 * A BLE / RFID reader fixed in one room or area. It posts the tags it hears to
 * POST /api/v1/asset-tracking/pings with its own key, and each tracked asset's
 * location becomes the zone of the gateway that heard it best most recently.
 */
@Schema({ timestamps: true, collection: 'partner_tracking_gateways' })
export class PartnerTrackingGateway {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Provider',
    required: true,
    index: true,
  })
  providerId: Types.ObjectId;
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ required: true, trim: true }) zone: string;
  /** sha256 of the key; the key itself is shown once. */
  @Prop({ required: true, unique: true }) keyHash: string;
  @Prop({ default: true }) active: boolean;
  @Prop() lastPingAt?: Date;
  @Prop() createdByName?: string;
  createdAt?: Date;
}

export const PartnerTrackingGatewaySchema = SchemaFactory.createForClass(
  PartnerTrackingGateway,
);
