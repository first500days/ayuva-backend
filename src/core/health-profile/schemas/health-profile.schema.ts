import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

export type HealthProfileDocument = HydratedDocument<HealthProfile>;

@Schema({ timestamps: true })
export class HealthProfile {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: User.name,
    required: true,
    unique: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({ required: true })
  age: number;

  @Prop({ required: true })
  gender: string;

  @Prop({ type: [String], default: [] })
  conditions: string[];

  @Prop({ type: [String], default: [] })
  allergies: string[];
}

export const HealthProfileSchema = SchemaFactory.createForClass(HealthProfile);
