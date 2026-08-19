import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export enum AdminUserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
}

export type AdminUserDocument = HydratedDocument<AdminUser>;

@Schema({ timestamps: true })
export class AdminUser {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  userId?: Types.ObjectId;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  email: string;

  @Prop({ required: true })
  fullName: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Role' })
  role?: Types.ObjectId;

  @Prop({ type: [String], default: [] })
  permissions: string[];

  @Prop({
    type: String,
    enum: AdminUserStatus,
    default: AdminUserStatus.ACTIVE,
    index: true,
  })
  status: AdminUserStatus;

  @Prop()
  lastLoginAt?: Date;

  @Prop({ default: false })
  mfaEnabled: boolean;

  @Prop()
  mfaSecret?: string;

  @Prop()
  passwordHash?: string;

  @Prop({ type: [String], default: [] })
  sessionIds: string[];

  createdAt?: Date;
  updatedAt?: Date;
}

export const AdminUserSchema = SchemaFactory.createForClass(AdminUser);
