import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type ReportLinkDocument = HydratedDocument<ReportLink>;
export type ReportLinkChannel = 'whatsapp' | 'email';

/**
 * One secure link sent to a patient over WhatsApp or email. The signed token
 * in the URL holds only this row's `jti`, so nothing about the patient travels
 * through Meta or the mail provider. Each link opens once, after a one-time
 * code sent to the patient's own phone.
 */
@Schema({ timestamps: true, collection: 'report_links' })
export class ReportLink {
  @Prop({ required: true, unique: true }) jti: string;

  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  recordId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  patientId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId }) providerId?: Types.ObjectId;

  @Prop({ type: String, required: true }) channel: ReportLinkChannel;

  @Prop({ required: true }) expiresAt: Date;

  // A patient can ask for a fresh link for a limited time after the first one.
  @Prop({ required: true }) firstIssuedAt: Date;
  @Prop({ default: 0 }) renewals: number;
  @Prop() replacedAt?: Date;

  @Prop() otpHash?: string;
  @Prop() otpExpiresAt?: Date;
  @Prop() otpSentAt?: Date;
  @Prop({ default: 0 }) otpSends: number;
  @Prop({ default: 0 }) otpFailures: number;
  @Prop() lockedUntil?: Date;

  @Prop() usedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ReportLinkSchema = SchemaFactory.createForClass(ReportLink);
