import { IsBoolean, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import type { FastingWindow, PrepTask } from '../prep-guidelines';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PrepPackItemDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: ['record', 'medication', 'condition', 'allergy', 'question', 'summary'] })
  kind: string;
  @ApiProperty() title: string;
  @ApiPropertyOptional() detail?: string;
  @ApiPropertyOptional() recordId?: string;
  @ApiPropertyOptional() date?: string;
  @ApiProperty() included: boolean;
}

export class PrepPackSectionDto {
  @ApiProperty({ enum: ['record', 'medication', 'condition', 'allergy', 'question', 'summary'] })
  kind: string;
  @ApiProperty() title: string;
  @ApiProperty() description: string;
  @ApiProperty({ type: [PrepPackItemDto] }) items: PrepPackItemDto[];
}

export class PrepPackResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() appointmentId: string;
  @ApiProperty() providerName: string;
  @ApiProperty() specialty: string;
  @ApiProperty() appointmentDate: string;
  @ApiProperty() appointmentTime: string;
  @ApiProperty({ type: [PrepPackSectionDto] }) sections: PrepPackSectionDto[];
  @ApiPropertyOptional({ description: 'The appointment time (ISO)' }) appointmentAt?: string;
  @ApiProperty({ description: 'What the patient wants the doctor to know' }) symptomNotes: string;
  @ApiProperty({ description: 'Whether the clinic receives the pre-visit bundle' }) sendToClinic: boolean;
  @ApiProperty({
    description:
      'Before the visit: a fasting countdown when a booked test needs it (hours from the lab), and ticks for the documents being prepared',
  })
  preparation: { fasting: FastingWindow | null; tasks: PrepTask[] };
  @ApiProperty({ enum: ['mock', 'real'] }) source: string;
  @ApiProperty() disclaimer: string;
}

export class UpdatePrepPackDto {
  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  symptomNotes?: string;

  @ApiPropertyOptional({ description: 'Item id → included', type: Object })
  @IsOptional()
  @IsObject()
  included?: Record<string, boolean>;

  @ApiPropertyOptional({
    description: "Send the notes, questions and chosen items to the appointment's clinic before the visit",
  })
  @IsOptional()
  @IsBoolean()
  sendToClinic?: boolean;
}
