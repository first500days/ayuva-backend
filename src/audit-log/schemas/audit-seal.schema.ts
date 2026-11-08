import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { makeAppendOnly } from '../append-only';

export type AuditSealDocument = HydratedDocument<AuditSeal>;

/** One sealed batch of log rows. See audit-seal.ts. */
@Schema({
  collection: 'audit_seals',
  timestamps: { createdAt: 'sealedAt', updatedAt: false },
})
export class AuditSeal {
  @Prop({ required: true }) source: string;
  @Prop({ required: true }) seq: number;
  // The batch is every row after `fromId`, up to and including `toId`.
  @Prop({ type: Types.ObjectId, required: true }) fromId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) toId: Types.ObjectId;
  @Prop({ required: true }) count: number;
  @Prop({ required: true }) rowsDigest: string;
  @Prop({ required: true }) prevHash: string;
  @Prop({ required: true }) hash: string;

  sealedAt?: Date;
}

export const AuditSealSchema = SchemaFactory.createForClass(AuditSeal);
AuditSealSchema.index({ source: 1, seq: 1 }, { unique: true });
makeAppendOnly(AuditSealSchema);
