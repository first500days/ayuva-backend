import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export enum LabDeliveryStatus {
  COLLECTED = 'collected',
  PROCESSING = 'processing',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  DELAYED = 'delayed',
  PENDING_COLLECTION = 'pending_collection',
  REJECTED = 'rejected',
}

export enum LabDeliveryMethod {
  ELECTRONIC_VAULT = 'electronic_vault',
  EMAIL = 'email',
  SMS_LINK = 'sms_link',
  LIMS_WEBHOOK = 'lims_webhook',
  PHYSICAL = 'physical',
  PATIENT_PORTAL = 'patient_portal',
}

@Schema({ _id: false })
export class LabDeliveryAttempt {
  @Prop({ required: true })
  attemptedAt: Date;

  @Prop({ required: true })
  method: LabDeliveryMethod;

  @Prop()
  responseCode?: number;

  @Prop()
  errorReason?: string;

  @Prop({ type: SchemaTypes.Mixed })
  payload?: Record<string, any>;

  @Prop({ default: false })
  success: boolean;
}
export const LabDeliveryAttemptSchema = SchemaFactory.createForClass(LabDeliveryAttempt);

@Schema({ _id: false })
export class LabDeliveryTestItem {
  @Prop({ required: true })
  testCode: string;

  @Prop({ required: true })
  testName: string;

  @Prop()
  category: string;

  @Prop()
  sampleType: string;

  @Prop()
  fastingRequired: boolean;
}
export const LabDeliveryTestItemSchema = SchemaFactory.createForClass(LabDeliveryTestItem);

export type LabDeliveryOrderDocument = HydratedDocument<LabDeliveryOrder>;

@Schema({ timestamps: true, collection: 'lab_delivery_orders' })
export class LabDeliveryOrder {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Lab', required: true, index: true })
  labId: Types.ObjectId;

  @Prop({ required: true })
  labName: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true, index: true })
  patientId: Types.ObjectId;

  @Prop({ required: true })
  patientName: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Appointment' })
  appointmentId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'DiagnosticTest' })
  testId: Types.ObjectId;

  @Prop({ type: [LabDeliveryTestItemSchema], default: [] })
  tests: LabDeliveryTestItem[];

  @Prop({ required: true })
  orderId: string;

  @Prop({ type: String, enum: LabDeliveryStatus, default: LabDeliveryStatus.PENDING_COLLECTION, index: true })
  status: LabDeliveryStatus;

  @Prop()
  collectedAt: Date;

  @Prop()
  processedAt: Date;

  @Prop()
  deliveredAt: Date;

  @Prop()
  expectedDeliveryAt: Date;

  @Prop({ enum: LabDeliveryMethod })
  deliveryMethod: LabDeliveryMethod;

  @Prop({ default: 0 })
  attempts: number;

  @Prop({ type: [LabDeliveryAttemptSchema], default: [] })
  attemptHistory: LabDeliveryAttempt[];

  @Prop()
  errorReason: string;

  @Prop({ type: SchemaTypes.Mixed })
  webhookPayload: Record<string, any>;

  @Prop({ type: SchemaTypes.Mixed })
  labReportMetadata: Record<string, any>;

  @Prop()
  reportFileUrl: string;

  @Prop()
  reportFileName: string;

  @Prop({ default: false })
  patientNotified: boolean;

  @Prop()
  notifiedAt: Date;

  @Prop()
  assignedTo: string;

  @Prop()
  priority: 'normal' | 'urgent' | 'stat';

  createdAt?: Date;
  updatedAt?: Date;
}

export const LabDeliveryOrderSchema = SchemaFactory.createForClass(LabDeliveryOrder);

LabDeliveryOrderSchema.index({ labId: 1, status: 1, createdAt: -1 });
LabDeliveryOrderSchema.index({ patientId: 1, status: 1 });
LabDeliveryOrderSchema.index({ orderId: 1 }, { unique: true });
LabDeliveryOrderSchema.index({ status: 1, expectedDeliveryAt: 1 });