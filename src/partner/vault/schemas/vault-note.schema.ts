import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

/** Where a note saved from research came from, enough to cite it. */
@Schema({ _id: false })
export class VaultCitation {
  @Prop() title?: string;
  @Prop() authors?: string;
  @Prop() journal?: string;
  @Prop() year?: string;
  @Prop() volume?: string;
  @Prop() issue?: string;
  @Prop() pages?: string;
  @Prop() doi?: string;
  @Prop() pmid?: string;
  @Prop() pmcid?: string;
  @Prop() url?: string;
}
export const VaultCitationSchema = SchemaFactory.createForClass(VaultCitation);

/**
 * A note in a doctor's own vault: private to the login that wrote it (no
 * admin or colleague can read it), and it leaves with them through export.
 */
@Schema({ timestamps: true, collection: 'doctor_vault_notes' })
export class VaultNote {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  ownerUserId: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 200 }) title: string;

  @Prop({ default: '', maxlength: 100_000 }) body: string;

  @Prop({ type: [String], default: [] }) tags: string[];

  @Prop({ default: false }) pinned: boolean;

  @Prop({ type: VaultCitationSchema }) citation?: VaultCitation;

  createdAt?: Date;
  updatedAt?: Date;
}

export type VaultNoteDocument = HydratedDocument<VaultNote>;
export const VaultNoteSchema = SchemaFactory.createForClass(VaultNote);
VaultNoteSchema.index({ ownerUserId: 1, updatedAt: -1 });
