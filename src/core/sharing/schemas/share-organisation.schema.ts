import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

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
}

export const ShareOrganisationSchema = SchemaFactory.createForClass(ShareOrganisation);
