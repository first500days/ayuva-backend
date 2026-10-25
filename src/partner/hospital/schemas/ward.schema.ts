import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export enum BedStatus {
  AVAILABLE = 'available',
  OCCUPIED = 'occupied',
  CLEANING = 'cleaning',
  MAINTENANCE = 'maintenance',
  RESERVED = 'reserved',
}

export const WARD_TYPES = [
  'general',
  'icu',
  'private',
  'semi_private',
  'emergency',
  'maternity',
  'paediatric',
] as const;

export const WARD_TYPE_LABEL: Record<string, string> = {
  general: 'General ward',
  icu: 'ICU',
  private: 'Private',
  semi_private: 'Semi-private',
  emergency: 'Emergency',
  maternity: 'Maternity',
  paediatric: 'Pediatrics',
};

/** Who a ward admits: male or female patients only, or anyone. */
export enum WardGender {
  MALE = 'male',
  FEMALE = 'female',
  MIXED = 'mixed',
}

@Schema()
export class Bed {
  @Prop({ required: true, trim: true }) label: string;
  @Prop({ type: String, enum: BedStatus, default: BedStatus.AVAILABLE })
  status: BedStatus;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'PartnerAdmission' })
  admissionId?: Types.ObjectId;
}
export const BedSchema = SchemaFactory.createForClass(Bed);

export type WardDocument = HydratedDocument<Ward>;

/** Inpatient ward and its beds (Bed board / Ward Management). */
@Schema({ timestamps: true, collection: 'partner_wards' })
export class Ward {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Provider',
    required: true,
    index: true,
  })
  providerId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  department?: string;

  // One of WARD_TYPES.
  @Prop({ default: 'general' })
  type: string;

  @Prop({ trim: true })
  floor?: string;

  // Wards created before this field existed are treated as mixed.
  @Prop({ type: String, enum: WardGender, default: WardGender.MIXED })
  genderPolicy: WardGender;

  @Prop({ type: [BedSchema], default: [] })
  beds: (Bed & { _id: Types.ObjectId })[];

  createdAt?: Date;
  updatedAt?: Date;
}

export const WardSchema = SchemaFactory.createForClass(Ward);
