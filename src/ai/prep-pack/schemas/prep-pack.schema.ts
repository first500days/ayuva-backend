import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type PrepPackDocument = HydratedDocument<PrepPack>;

@Schema({ timestamps: true })
export class PrepPack {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, index: true })
  appointmentId: string;

  @Prop({ type: Object, default: [] })
  sections: Record<string, unknown>[];
}

export const PrepPackSchema = SchemaFactory.createForClass(PrepPack);
PrepPackSchema.index({ userId: 1, appointmentId: 1 }, { unique: true });
