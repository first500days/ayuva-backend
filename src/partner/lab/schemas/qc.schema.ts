import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type QcMaterialDocument = HydratedDocument<QcMaterial>;

/** A control material: one analyte at one level, on one analyser, with its target. */
@Schema({ timestamps: true, collection: 'partner_qc_materials' })
export class QcMaterial {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Provider',
    required: true,
    index: true,
  })
  providerId: Types.ObjectId;

  @Prop({ required: true, trim: true }) analyte: string;
  @Prop({ trim: true }) unit?: string;
  /** e.g. "Level 1 (normal)". */
  @Prop({ required: true, trim: true }) level: string;
  @Prop({ required: true, trim: true }) lot: string;
  @Prop() lotExpiry?: Date;
  @Prop({ trim: true }) instrument?: string;
  /** The sample ID an analyser reports for this control (the control vial's barcode), upper case. */
  @Prop({ trim: true, uppercase: true }) controlId?: string;
  @Prop({ required: true }) targetMean: number;
  @Prop({ required: true }) targetSd: number;
  @Prop({ default: true }) active: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}
export const QcMaterialSchema = SchemaFactory.createForClass(QcMaterial);
QcMaterialSchema.index({ providerId: 1, controlId: 1 });

export type QcRunDocument = HydratedDocument<QcRun>;

/** One control result, evaluated by the Westgard rules when it was entered. */
@Schema({ timestamps: true, collection: 'partner_qc_runs' })
export class QcRun {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Provider', required: true })
  providerId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'QcMaterial', required: true })
  materialId: Types.ObjectId;

  @Prop({ required: true }) value: number;
  @Prop({ required: true }) at: Date;
  @Prop({ required: true }) byName: string;
  /** Target in force when the run was entered (targets can change with a new lot). */
  @Prop({ required: true }) mean: number;
  @Prop({ required: true }) sd: number;

  @Prop({ required: true }) z: number;
  @Prop({ type: [String], default: [] }) rules: string[];
  @Prop({ required: true }) status: string;
  @Prop({ trim: true }) note?: string;

  /** Corrective action recorded for a warning or rejection. */
  @Prop({ trim: true }) reviewNote?: string;
  @Prop() reviewedBy?: string;
  @Prop() reviewedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}
export const QcRunSchema = SchemaFactory.createForClass(QcRun);
QcRunSchema.index({ providerId: 1, materialId: 1, at: -1 });
