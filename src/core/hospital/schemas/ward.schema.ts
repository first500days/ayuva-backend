import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export enum BedStatus {
  AVAILABLE = 'available',
  OCCUPIED = 'occupied',
  CLEANING = 'cleaning',
  MAINTENANCE = 'maintenance',
  RESERVED = 'reserved',
}

export enum WardGender {
  MALE = 'male',
  FEMALE = 'female',
  MIXED = 'mixed',
}

@Schema({ _id: false })
export class Bed {
  /** Short label used as the bed's id (e.g. "A1") — unique within the ward, not a Mongo ObjectId. */
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  label: string;

  @Prop({ type: String, enum: BedStatus, default: BedStatus.AVAILABLE })
  status: BedStatus;

  @Prop({ type: Number, default: null })
  x: number | null;

  @Prop({ type: Number, default: null })
  y: number | null;
}
export const BedSchema = SchemaFactory.createForClass(Bed);

export type WardDocument = HydratedDocument<Ward>;

@Schema({ timestamps: true })
export class Ward {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Provider', required: true, index: true })
  providerId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ type: String, default: null })
  department: string | null;

  @Prop({ default: 'general' })
  type: string;

  @Prop({ type: String, default: null })
  floor: string | null;

  @Prop({ type: String, enum: WardGender, default: WardGender.MIXED })
  genderPolicy: WardGender;

  @Prop({ type: Number, default: null })
  layoutCols: number | null;

  @Prop({ type: [BedSchema], default: [] })
  beds: Bed[];

  createdAt?: Date;
  updatedAt?: Date;
}
export const WardSchema = SchemaFactory.createForClass(Ward);
