import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WebhookLogDocument = HydratedDocument<WebhookLog>;

@Schema({ timestamps: true })
export class WebhookLog {
  @Prop({ required: true })
  event: string;

  @Prop({ required: true })
  source: string; // 'razorpay' | 'hospital_emr' | 'lab_lims' | 'resend'

  @Prop({ type: String, enum: ['success', 'failed', 'retrying', 'pending'], default: 'success' })
  status: 'success' | 'failed' | 'retrying' | 'pending';

  @Prop({ default: 200 })
  responseCode: number;

  @Prop({ default: 1 })
  attempts: number;

  @Prop({ type: Object })
  payload: Record<string, any>;

  @Prop()
  errorMessage?: string;

  @Prop({ default: Date.now })
  receivedAt: Date;
}

export const WebhookLogSchema = SchemaFactory.createForClass(WebhookLog);
