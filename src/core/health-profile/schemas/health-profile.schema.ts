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

  // Derived from dateOfBirth when there is one; read the age through
  // patientAge() so it stays current after birthdays.
  @Prop({ required: true })
  age: number;

  @Prop()
  dateOfBirth?: Date;

  @Prop({ required: true })
  gender: string;

  @Prop({ type: [String], default: [] })
  conditions: string[];

  @Prop({ type: [String], default: [] })
  allergies: string[];
}

export const HealthProfileSchema = SchemaFactory.createForClass(HealthProfile);
