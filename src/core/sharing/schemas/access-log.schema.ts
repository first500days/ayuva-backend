import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type AccessLogDocument = HydratedDocument<AccessLog>;

@Schema({ timestamps: { createdAt: 'occurredAt', updatedAt: false } })
export class AccessLog {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  grantId: string;

  @Prop({ required: true })
  organisationName: string;

  @Prop({ required: true })
  recordTitle: string;

  @Prop({ required: true })
  action: string; // 'viewed' | 'downloaded' | 'granted' | 'revoked' | 'expired'

  occurredAt?: Date;
}

export const AccessLogSchema = SchemaFactory.createForClass(AccessLog);
