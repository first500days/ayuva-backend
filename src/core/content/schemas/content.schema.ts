import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export enum ContentType {
  FAQ = 'FAQ',
  HELP_ARTICLE = 'HELP_ARTICLE',
  POLICY = 'POLICY',
  DISCLAIMER = 'DISCLAIMER',
  HEALTH_EDUCATION = 'HEALTH_EDUCATION',
}

export enum ContentStatus {
  DRAFT = 'DRAFT',
  IN_REVIEW = 'IN_REVIEW',
  PUBLISHED = 'PUBLISHED',
  UNPUBLISHED = 'UNPUBLISHED',
}

export type ContentDocument = HydratedDocument<Content>;

@Schema({ timestamps: true })
export class Content {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true, unique: true, index: true })
  slug: string;

  @Prop({ type: String, enum: ContentType, required: true, index: true })
  type: ContentType;

  @Prop()
  body?: string;

  @Prop({
    type: String,
    enum: ContentStatus,
    default: ContentStatus.DRAFT,
    index: true,
  })
  status: ContentStatus;

  @Prop()
  publishedAt?: Date;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'AdminUser' })
  authorId?: Types.ObjectId;

  @Prop({ default: 1 })
  version: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ContentSchema = SchemaFactory.createForClass(Content);
