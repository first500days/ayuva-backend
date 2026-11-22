import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

@Schema({ _id: false })
export class DispenseBatch {
  @Prop({ required: true }) batchNo: string;
  @Prop() expiryDate?: Date;
  @Prop({ required: true }) quantity: number;
  @Prop() mrp?: number;
}
export const DispenseBatchSchema = SchemaFactory.createForClass(DispenseBatch);

/** What the pharmacy did for one prescription line. */
@Schema({ _id: false })
export class DispenseLine {
  // Index of the line in the prescription's items.
  @Prop({ required: true }) rxIndex: number;
  // As the doctor wrote it.
  @Prop({ required: true }) medicine: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'StockItem' })
  itemId?: Types.ObjectId;
  @Prop() itemName?: string;
  @Prop({ default: 0 }) quantity: number;
  @Prop() unit?: string;
  @Prop({ type: [DispenseBatchSchema], default: [] }) batches: DispenseBatch[];

  // This line needs nothing more (fully supplied, or closed as not supplied).
  @Prop({ default: true }) complete: boolean;
  // 'out_of_stock' | 'patient_declined' | 'bought_outside' | 'doctor_stopped'
  @Prop() notSupplied?: string;
  // The pharmacist supplied a different brand / product than written.
  @Prop({ default: false }) substituted: boolean;
}
export const DispenseLineSchema = SchemaFactory.createForClass(DispenseLine);

export type DispenseDocument = HydratedDocument<Dispense>;

/**
 * One pharmacy hand-over against a signed e-prescription. The prescription
 * itself is never changed (signed slips are immutable); its fulfilment is
 * worked out from these records.
 */
@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'partner_dispenses',
})
export class Dispense {
  @Prop({ required: true, unique: true }) dispenseNo: string;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Provider',
    required: true,
    index: true,
  })
  providerId: Types.ObjectId;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Prescription',
    required: true,
    index: true,
  })
  prescriptionId: Types.ObjectId;

  @Prop({ required: true }) rxNumber: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' }) patientId?: Types.ObjectId;
  @Prop({ required: true }) patientName: string;

  @Prop({ type: [DispenseLineSchema], default: [] }) lines: DispenseLine[];

  // Sum of quantity × MRP where the batch has an MRP.
  @Prop({ default: 0 }) amount: number;

  @Prop({ trim: true }) note?: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'PartnerMember' })
  byMemberId?: Types.ObjectId;
  @Prop() byName?: string;

  createdAt?: Date;
}

export const DispenseSchema = SchemaFactory.createForClass(Dispense);
