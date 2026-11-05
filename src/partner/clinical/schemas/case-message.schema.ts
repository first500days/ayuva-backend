import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

@Schema({ _id: false })
export class CaseMention {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  memberId: Types.ObjectId;

  @Prop({ required: true }) name: string;
}
export const CaseMentionSchema = SchemaFactory.createForClass(CaseMention);

export type CaseMessageDocument = HydratedDocument<CaseMessage>;

/**
 * Internal case discussion: clinicians in one organisation talking about a
 * patient, with @mentions. Never shared with the patient or other
 * organisations. A removed message keeps its text for the record but is
 * no longer shown.
 */
@Schema({ timestamps: true, collection: 'partner_case_messages' })
export class CaseMessage {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Provider', required: true })
  providerId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  patientId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'PartnerMember', required: true })
  authorMemberId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  authorUserId: Types.ObjectId;

  @Prop({ required: true }) authorName: string;
  @Prop({ required: true }) authorRole: string;
  @Prop({ required: true }) body: string;

  @Prop({ type: [CaseMentionSchema], default: [] })
  mentions: CaseMention[];

  @Prop() removedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const CaseMessageSchema = SchemaFactory.createForClass(CaseMessage);
CaseMessageSchema.index({ providerId: 1, patientId: 1, createdAt: -1 });
