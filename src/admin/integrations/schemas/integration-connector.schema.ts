import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type IntegrationConnectorDocument = HydratedDocument<IntegrationConnector>;

@Schema({ timestamps: true })
export class IntegrationConnector {
  @Prop({ required: true, unique: true })
  connectorKey: string; // 'hospital_emr' | 'lab_lims' | 'razorpay' | 'resend_email' | 'twilio_sms' | 'gemini_ai' | 'fcm'

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  category: string;

  @Prop({ type: String, enum: ['connected', 'degraded', 'disconnected', 'maintenance'], default: 'connected' })
  status: 'connected' | 'degraded' | 'disconnected' | 'maintenance';

  @Prop({ default: 45 })
  latencyMs: number;

  @Prop({ default: 99.9 })
  uptimePercent: number;

  @Prop({ default: Date.now })
  lastHeartbeat: Date;

  @Prop({ default: 0 })
  errorRate24h: number;

  @Prop({ default: 'https://api.external.com/v1' })
  endpointUrl: string;

  @Prop({ default: 'OAuth2 / Bearer' })
  authType: string;

  @Prop({ default: 1240 })
  requests24h: number;
}

export const IntegrationConnectorSchema = SchemaFactory.createForClass(IntegrationConnector);
