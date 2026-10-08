import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type ResultFlag =
  | 'normal'
  | 'low'
  | 'high'
  | 'critical_low'
  | 'critical_high'
  | 'abnormal'
  | 'none';

@Schema({ _id: false })
export class ResultValue {
  @Prop({ required: true }) name: string;
  @Prop({ default: '' }) value: string;
  @Prop() unit?: string;
  @Prop() refLow?: number;
  @Prop() refHigh?: number;
  @Prop() refText?: string;
  @Prop() criticalLow?: number;
  @Prop() criticalHigh?: number;
  @Prop({ default: 'none' }) flag: string;
}
export const ResultValueSchema = SchemaFactory.createForClass(ResultValue);

@Schema({ _id: false })
export class ResultTest {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'LabCatalogItem' })
  testId?: Types.ObjectId;
  @Prop({ required: true }) name: string;
  @Prop({ type: [ResultValueSchema], default: [] }) values: ResultValue[];
}
export const ResultTestSchema = SchemaFactory.createForClass(ResultTest);

export type LabResultDocument = HydratedDocument<LabResult>;

/**
 * Structured report built in the Report Builder. Technicians draft it; a
 * pathologist (or the centre admin) releases it, which renders the PDF into
 * the patient's vault. Released values feed lab-trend charts on the Patient
 * Timeline for doctors the patient has shared that report with.
 */
@Schema({ timestamps: true, collection: 'partner_lab_results' })
export class LabResult {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Provider',
    required: true,
    index: true,
  })
  providerId: Types.ObjectId;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'PartnerLabOrder',
    required: true,
    unique: true,
  })
  orderId: Types.ObjectId;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  patientId: Types.ObjectId;

  @Prop({ type: [ResultTestSchema], default: [] })
  tests: ResultTest[];

  // Interpretive comment written by the signing pathologist.
  @Prop({ default: '' })
  comments: string;

  @Prop({ type: String, enum: ['draft', 'released'], default: 'draft' })
  status: string;

  @Prop({ default: false })
  critical: boolean;

  @Prop() draftedByName?: string;
  @Prop() releasedByName?: string;
  @Prop() releasedAt?: Date;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'MedicalRecord',
    index: true,
    sparse: true,
  })
  recordId?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export const LabResultSchema = SchemaFactory.createForClass(LabResult);
