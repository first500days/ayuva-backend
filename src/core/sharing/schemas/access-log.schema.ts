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

  // Set for partner-initiated events so every view is attributable (P04).
  @Prop({ type: SchemaTypes.ObjectId, index: true, sparse: true })
  viewerUserId?: Types.ObjectId;

  @Prop()
  viewerName?: string;

  occurredAt?: Date;
}

export const AccessLogSchema = SchemaFactory.createForClass(AccessLog);
