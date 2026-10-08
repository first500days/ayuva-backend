import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

/** The Lab Queue pipeline, in order. */
export enum LabOrderStatus {
  ORDERED = 'ordered',
  SAMPLE_COLLECTED = 'sample_collected',
  PROCESSING = 'processing',
  REPORT_READY = 'report_ready',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
}

@Schema({ _id: false })
export class LabOrderItem {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'LabCatalogItem', required: true })
  testId: Types.ObjectId;
  @Prop({ required: true }) code: string;
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) category: string;
  @Prop({ required: true }) price: number;
  @Prop() sampleType?: string;
  @Prop({ default: 24 }) tatHours: number;
}
export const LabOrderItemSchema = SchemaFactory.createForClass(LabOrderItem);

@Schema({ _id: false })
export class LabCollection {
  // 'lab' (walk-in / at centre) | 'home'
  @Prop({ required: true, default: 'lab' }) type: string;
  @Prop({ trim: true }) address?: string;
  @Prop() scheduledAt?: Date;
  @Prop() collectedAt?: Date;
}
export const LabCollectionSchema = SchemaFactory.createForClass(LabCollection);

@Schema({ _id: false })
export class LabOrderEvent {
  @Prop({ required: true }) at: Date;
  @Prop({ required: true }) status: string;
  @Prop() byName?: string;
  @Prop() note?: string;
}
export const LabOrderEventSchema = SchemaFactory.createForClass(LabOrderEvent);

/** A DICOM file attached to an order — encrypted at rest like vault files. */
@Schema()
export class ImagingFile {
  @Prop({ required: true }) fileRef: string;
  @Prop({ required: true }) fileName: string;
  @Prop({ default: 0 }) size: number;
  @Prop({ required: true }) uploadedAt: Date;
  @Prop() uploadedByName?: string;
  @Prop() description?: string;
}
export const ImagingFileSchema = SchemaFactory.createForClass(ImagingFile);

@Schema({ _id: false })
export class LabPayment {
  // 'unpaid' | 'paid' | 'waived'
  @Prop({ default: 'unpaid' }) status: string;
  @Prop() method?: string;
  @Prop() paidAt?: Date;
}
export const LabPaymentSchema = SchemaFactory.createForClass(LabPayment);

export type LabOrderDocument = HydratedDocument<PartnerLabOrder>;

/** A diagnostic order moving through the lab: collection → processing → report → delivery. */
@Schema({ timestamps: true, collection: 'partner_lab_orders' })
export class PartnerLabOrder {
  @Prop({ required: true, unique: true })
  orderNo: string;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Provider',
    required: true,
    index: true,
  })
  providerId: Types.ObjectId;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  patientId: Types.ObjectId;

  @Prop({ required: true })
  patientName: string;

  @Prop({ type: [LabOrderItemSchema], default: [] })
  items: LabOrderItem[];

  @Prop({ default: 0 })
  total: number;

  // 'walk_in' | 'appointment' | 'referral'
  @Prop({ required: true, default: 'walk_in' })
  source: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Appointment' })
  appointmentId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Referral' })
  referralId?: Types.ObjectId;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Provider',
    index: true,
    sparse: true,
  })
  referringProviderId?: Types.ObjectId;

  @Prop()
  referringProviderName?: string;

  @Prop()
  referringDoctorName?: string;

  @Prop({ type: LabCollectionSchema, default: () => ({ type: 'lab' }) })
  sampleCollection: LabCollection;

  // 'routine' | 'urgent' | 'stat'
  @Prop({ default: 'routine' })
  priority: string;

  @Prop({
    type: String,
    enum: LabOrderStatus,
    default: LabOrderStatus.ORDERED,
    index: true,
  })
  status: LabOrderStatus;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'PartnerMember',
    index: true,
    sparse: true,
  })
  technicianMemberId?: Types.ObjectId;

  @Prop()
  technicianName?: string;

  // Phlebotomist for home collection.
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'PartnerMember',
    index: true,
    sparse: true,
  })
  collectorMemberId?: Types.ObjectId;

  @Prop()
  collectorName?: string;

  @Prop({ type: [LabOrderEventSchema], default: [] })
  statusHistory: LabOrderEvent[];

  // When the report is due, from the slowest test's turnaround.
  @Prop()
  dueAt?: Date;

  @Prop()
  deliveredAt?: Date;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'MedicalRecord' })
  vaultRecordId?: Types.ObjectId;

  @Prop({ type: [ImagingFileSchema], default: [] })
  imaging: (ImagingFile & { _id: Types.ObjectId })[];

  // Link to the study in an external PACS viewer, when the centre uses one.
  @Prop({ trim: true })
  pacsUrl?: string;

  @Prop({ type: LabPaymentSchema, default: () => ({ status: 'unpaid' }) })
  payment: LabPayment;

  @Prop({ default: '' })
  notes: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const PartnerLabOrderSchema =
  SchemaFactory.createForClass(PartnerLabOrder);
PartnerLabOrderSchema.index({ providerId: 1, status: 1, createdAt: -1 });
