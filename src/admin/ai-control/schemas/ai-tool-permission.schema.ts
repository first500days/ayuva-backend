import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AiToolPermissionDocument = HydratedDocument<AiToolPermission>;

@Schema({ timestamps: true })
export class AiToolPermission {
  @Prop({ required: true, unique: true })
  toolName: string;

  @Prop({ required: true })
  displayName: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true })
  category: string; // 'discovery' | 'records' | 'booking' | 'navigation' | 'clinical'

  @Prop({ type: String, enum: ['allowed', 'confirmation_required', 'restricted', 'disabled'], default: 'allowed' })
  permissionState: 'allowed' | 'confirmation_required' | 'restricted' | 'disabled';

  @Prop({ default: true })
  auditLogged: boolean;

  @Prop({ default: 0 })
  executionCount24h: number;

  @Prop({ default: 99.4 })
  successRatePercent: number;
}

export const AiToolPermissionSchema = SchemaFactory.createForClass(AiToolPermission);
