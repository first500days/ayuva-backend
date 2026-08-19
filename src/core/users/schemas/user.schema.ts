import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum UserRole {
  PATIENT = 'patient',
  ADMIN = 'admin',
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  DEACTIVATED = 'deactivated',
}

// Bump whenever ToS/Privacy/health-data-processing copy changes materially (PRD FR-1.5, TRD §6).
export const CURRENT_CONSENT_VERSION = '2026-01-01';

@Schema({ _id: false })
export class UserConsent {
  @Prop({ required: true })
  termsAccepted: boolean;

  @Prop({ required: true })
  privacyAccepted: boolean;

  @Prop({ required: true })
  healthDataProcessingAccepted: boolean;

  @Prop({ required: true })
  version: string;

  @Prop({ required: true })
  acceptedAt: Date;
}
export const UserConsentSchema = SchemaFactory.createForClass(UserConsent);

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, trim: true })
  fullName: string;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  email: string;

  // Only one of passwordHash / oauthId is set, depending on sign-up method (PRD FR-1.2, FR-1.3).
  @Prop()
  passwordHash?: string;

  @Prop()
  oauthId?: string;

  @Prop()
  oauthProvider?: string;

  @Prop({ type: String, enum: UserRole, default: UserRole.PATIENT })
  role: UserRole;

  @Prop({ type: String, enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus;

  @Prop()
  suspendedAt?: Date;

  @Prop()
  deactivatedAt?: Date;

  @Prop()
  lastLoginAt?: Date;

  @Prop()
  resetPasswordToken?: string;

  @Prop()
  resetPasswordTokenExpiresAt?: Date;

  // Captured once at registration; required before an account can be created (PRD FR-1.5).
  @Prop({ type: UserConsentSchema, required: true })
  consent: UserConsent;

  // Populated by the timestamps:true schema option — declared for typed access (Admin User Management, FR-12.1).
  createdAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
