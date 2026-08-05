import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { User } from '../../core/users/schemas/user.schema';

export enum DevicePlatform {
  IOS = 'ios',
  ANDROID = 'android',
  WEB = 'web',
}

export type DeviceTokenDocument = HydratedDocument<DeviceToken>;

/** One registered push destination per (userId, token) pair (FR-10.3, FR-7.6, TRD §8 FCM). */
@Schema({ timestamps: true })
export class DeviceToken {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: User.name,
    required: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({ required: true, unique: true })
  token: string;

  @Prop({ type: String, enum: DevicePlatform, required: false })
  platform?: DevicePlatform;
}

export const DeviceTokenSchema = SchemaFactory.createForClass(DeviceToken);
