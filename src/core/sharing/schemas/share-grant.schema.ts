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

  @Prop({ required: true })
  scopeKind: string; // 'documents' | 'summary'

  @Prop({ type: [String], default: [] })
  recordIds: string[];

  @Prop({ type: [String], default: [] })
  recordTitles: string[];

  @Prop({ required: true })
  purpose: string;

  @Prop({ required: true })
  duration: string;

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
