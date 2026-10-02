import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type ShareGrantDocument = HydratedDocument<ShareGrant>;

@Schema({ timestamps: { createdAt: 'grantedAt', updatedAt: false } })
export class ShareGrant {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  organisationId: string;

  @Prop({ required: true })
  organisationName: string;

  // ShareScope: 'full' | 'rolling_months' | 'types' | 'documents' (v1: 'summary').
  // Resolved to records at read time by grantRecordFilter (share-scope.ts).
  @Prop({ required: true })
  scopeKind: string;

  // 'documents' scope: exactly these records.
  @Prop({ type: [String], default: [] })
  recordIds: string[];

  @Prop({ type: [String], default: [] })
  recordTitles: string[];

  // 'types' scope: these vault folders.
  @Prop({ type: [String], default: [] })
  recordTypes: string[];

  // 'rolling_months' scope: window length.
  @Prop()
  rollingMonths?: number;

  @Prop({ required: true })
  purpose: string;

  // ShareDuration: 'visit' | '30d' | 'until_revoked' (v1 also '24h' | '7d').
  @Prop({ required: true })
  duration: string;

  // 'visit' duration: the appointment it covers. Cancelling or rejecting the
  // appointment revokes the grant.
  @Prop({ type: SchemaTypes.ObjectId, index: true, sparse: true })
  appointmentId?: Types.ObjectId;

  @Prop({ default: 'active' })
  status: string; // 'active' | 'expired' | 'revoked'

  @Prop()
  expiresAt?: Date;

  @Prop()
  revokedAt?: Date;

  @Prop({ default: 0 })
  accessCount: number;

  @Prop()
  lastAccessedAt?: Date;

  grantedAt?: Date;
}

export const ShareGrantSchema = SchemaFactory.createForClass(ShareGrant);
ShareGrantSchema.index({ userId: 1, status: 1 });
