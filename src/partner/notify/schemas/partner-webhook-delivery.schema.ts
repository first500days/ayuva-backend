import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type PartnerWebhookDeliveryDocument =
  HydratedDocument<PartnerWebhookDelivery>;

/** One webhook POST attempt, shown in the Notification Center delivery log. Kept 30 days. */
@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'partner_webhook_deliveries',
})
export class PartnerWebhookDelivery {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Provider',
    required: true,
    index: true,
  })
  providerId: Types.ObjectId;

  @Prop({ required: true })
  eventId: string;

  @Prop({ required: true })
  trigger: string;

  @Prop({ required: true })
  url: string;

  @Prop()
  statusCode?: number;

  @Prop({ default: false })
  ok: boolean;

  @Prop()
  error?: string;

  @Prop({ default: 0 })
  durationMs: number;

  @Prop({ default: false })
  test: boolean;

  createdAt?: Date;
}

export const PartnerWebhookDeliverySchema = SchemaFactory.createForClass(
  PartnerWebhookDelivery,
);
PartnerWebhookDeliverySchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60 },
);
PartnerWebhookDeliverySchema.index({ providerId: 1, createdAt: -1 });
