import {
  currentIp,
  isLoopbackIp,
} from '../../../common/request-context/client-ip';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { makeAppendOnly } from '../../../audit-log/append-only';

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

  // The viewer's public address, captured from the request when the row is written.
  @Prop()
  ipAddress?: string;

  occurredAt?: Date;
}

export const AccessLogSchema = SchemaFactory.createForClass(AccessLog);
AccessLogSchema.pre('validate', function () {
  if (this.ipAddress) return;
  const ip = currentIp();
  if (ip && !isLoopbackIp(ip)) this.ipAddress = ip;
});
makeAppendOnly(AccessLogSchema);
