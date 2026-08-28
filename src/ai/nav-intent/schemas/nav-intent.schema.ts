import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type NavIntentDocument = HydratedDocument<NavIntent>;

@Schema({ timestamps: { createdAt: 'createdAt', updatedAt: false } })
export class NavIntent {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  rawText: string;

  @Prop({ type: [String], default: [] })
  understood: string[];

  @Prop({ required: true })
  summary: string;

  @Prop({ type: Object, default: {} })
  suggestedFilters: Record<string, unknown>;

  @Prop({ type: Object, default: [] })
  suggestedActions: Record<string, unknown>[];

  @Prop({ type: Object, default: [] })
  relatedTests: Record<string, unknown>[];

  createdAt?: Date;
}

export const NavIntentSchema = SchemaFactory.createForClass(NavIntent);
