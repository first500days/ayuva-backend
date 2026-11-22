import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export const FHIR_AUTH_TYPES = [
  'none',
  'bearer',
  'basic',
  'client_credentials',
] as const;
export type FhirAuthType = (typeof FHIR_AUTH_TYPES)[number];

export type FhirConnectionDocument = HydratedDocument<FhirConnection>;

/** A hospital system this lab can query over FHIR. The secret is stored encrypted. */
@Schema({ timestamps: true, collection: 'partner_fhir_connections' })
export class FhirConnection {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Provider', required: true, index: true })
  providerId: Types.ObjectId;

  @Prop({ required: true, trim: true }) name: string;
  @Prop({ required: true, trim: true }) baseUrl: string;
  @Prop({ type: String, required: true, default: 'none' }) authType: FhirAuthType;

  // Username for basic sign-in, client ID for client credentials.
  @Prop({ trim: true }) username?: string;
  @Prop() secretEnc?: string;
  @Prop({ trim: true }) tokenUrl?: string;
  @Prop({ trim: true }) scope?: string;

  @Prop({ default: true }) active: boolean;
  @Prop() lastUsedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const FhirConnectionSchema = SchemaFactory.createForClass(FhirConnection);
