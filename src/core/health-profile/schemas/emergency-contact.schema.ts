import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

export type EmergencyContactDocument = HydratedDocument<EmergencyContact>;

@Schema({ timestamps: true })
export class EmergencyContact {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: User.name,
    required: true,
    unique: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  phone: string;
}

export const EmergencyContactSchema =
  SchemaFactory.createForClass(EmergencyContact);
