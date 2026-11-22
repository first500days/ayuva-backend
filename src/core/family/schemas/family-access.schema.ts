import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

/** What a second adult may do with a family profile: read only, or act for it. */
export type FamilyAccessLevel = 'view' | 'manage';

/**
 * Another AYUVA account given access to a family profile by its guardian, e.g.
 * the other parent or a spouse, with a permission level. The guardian who
 * created the profile always has full access and isn't listed here.
 */
@Schema({ timestamps: true, collection: 'family_access' })
export class FamilyAccess {
  /** The family profile (a managed member account). */
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  profileId: Types.ObjectId;

  /** The account given access. */
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: ['view', 'manage'], required: true })
  level: FamilyAccessLevel;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  grantedBy: Types.ObjectId;
}

export type FamilyAccessDocument = HydratedDocument<FamilyAccess>;
export const FamilyAccessSchema = SchemaFactory.createForClass(FamilyAccess);
FamilyAccessSchema.index({ profileId: 1, userId: 1 }, { unique: true });
