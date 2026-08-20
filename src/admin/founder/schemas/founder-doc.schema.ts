import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type FounderDocDocument = HydratedDocument<FounderDoc>;

@Schema({ timestamps: true })
export class FounderDoc {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  category: 'board' | 'investor' | 'legal' | 'strategy';

  @Prop({ required: true })
  confidentialityLevel: 'strictly_confidential' | 'restricted';

  @Prop({ required: true })
  fileUrl: string;

  @Prop({ required: true })
  uploadedBy: string;

  @Prop()
  fileSizeBytes?: number;

  @Prop({ default: 0 })
  accessCount: number;
}

export const FounderDocSchema = SchemaFactory.createForClass(FounderDoc);
