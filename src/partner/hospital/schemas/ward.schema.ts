import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export enum BedStatus {
  AVAILABLE = 'available',
  OCCUPIED = 'occupied',
  CLEANING = 'cleaning',
  MAINTENANCE = 'maintenance',
  RESERVED = 'reserved',
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

  // 'general' | 'icu' | 'private' | 'semi_private' | 'emergency' | 'maternity' | 'paediatric'
  @Prop({ default: 'general' })
  type: string;

  @Prop({ trim: true })
  floor?: string;

  @Prop({ type: [BedSchema], default: [] })
  beds: (Bed & { _id: Types.ObjectId })[];

  createdAt?: Date;
  updatedAt?: Date;
}

export const WardSchema = SchemaFactory.createForClass(Ward);
