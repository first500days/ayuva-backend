import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { MedicalRecordType } from '../schemas/medical-record.schema';

export class UploadRecordDto {
  @ApiPropertyOptional({
    enum: MedicalRecordType,
    description:
      'Manual override — otherwise auto-categorised from filename/mimetype (FR-8.3)',
  })
  @IsOptional()
  @IsEnum(MedicalRecordType)
  type?: MedicalRecordType;
}
