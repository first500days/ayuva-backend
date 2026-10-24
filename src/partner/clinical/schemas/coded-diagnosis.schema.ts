import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/** A diagnosis picked from the ICD-11 / SNOMED CT search, never typed free-form. */
@Schema({ _id: false })
export class CodedDiagnosis {
  @Prop({ required: true }) icd11: string;
  @Prop({ required: true }) snomed: string;
  @Prop({ required: true }) display: string;
}
export const CodedDiagnosisSchema =
  SchemaFactory.createForClass(CodedDiagnosis);
