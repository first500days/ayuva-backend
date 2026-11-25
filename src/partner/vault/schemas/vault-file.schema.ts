import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

/** A file in a doctor's own vault (their PDF guidelines, images), stored encrypted. */
@Schema({ timestamps: true, collection: 'doctor_vault_files' })
export class VaultFile {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  ownerUserId: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 200 }) name: string;

  @Prop({ required: true }) mimeType: string;

  @Prop({ required: true }) size: number;

  @Prop({ required: true }) fileRef: string;

  @Prop({ type: [String], default: [] }) tags: string[];

  createdAt?: Date;
  updatedAt?: Date;
}

export type VaultFileDocument = HydratedDocument<VaultFile>;
export const VaultFileSchema = SchemaFactory.createForClass(VaultFile);
