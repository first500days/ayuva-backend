import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type ShareOrganisationDocument = HydratedDocument<ShareOrganisation>;

@Schema({ timestamps: true })
export class ShareOrganisation {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  type: string; // 'hospital' | 'clinic' | 'lab' | 'doctor'

  @Prop({ default: '' })
  address: string;

  @Prop({ default: true })
  connected: boolean;

  // Links this sharing target to a Partner Portal provider so grants reach that partner (P04).
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Provider', index: true, sparse: true })
  providerId?: Types.ObjectId;
}

export const ShareOrganisationSchema = SchemaFactory.createForClass(ShareOrganisation);
