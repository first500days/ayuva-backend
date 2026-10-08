import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsISO8601,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

const toBool = ({ value }: { value: unknown }) =>
  value === true || value === 'true' || value === '1';

export class PatientsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) q?: string;

  @ApiPropertyOptional({
    description: 'Only patients assigned to / treated by me',
  })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  mine?: boolean;
}

export class ScribeStructureDto {
  @ApiProperty({
    description: "The doctor's typed or dictated consultation text",
  })
  @IsString()
  @MinLength(3)
  @MaxLength(20000)
  text: string;
}

export class NoteSectionsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  chiefComplaint?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  history?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  examination?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  assessment?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  plan?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  advice?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  followUp?: string;
}

export class NoteVitalsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) bp?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  pulse?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  temperature?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) spo2?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  respiratoryRate?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  weight?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  height?: string;
}

export class CreateNoteDto {
  @ApiProperty() @IsMongoId() patientId: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() appointmentId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  rawInput?: string;

  @ApiPropertyOptional({ enum: ['typed', 'dictated', 'mixed'] })
  @IsOptional()
  @IsIn(['typed', 'dictated', 'mixed'])
  inputMode?: string;

  @ApiPropertyOptional({ type: NoteSectionsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NoteSectionsDto)
  sections?: NoteSectionsDto;

  @ApiPropertyOptional({ type: NoteVitalsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NoteVitalsDto)
  vitals?: NoteVitalsDto;

  @ApiPropertyOptional({ enum: ['mock', 'real', 'manual'] })
  @IsOptional()
  @IsIn(['mock', 'real', 'manual'])
  structuringSource?: string;
}

export class UpdateNoteDto {
  @ApiPropertyOptional() @IsOptional() @IsMongoId() appointmentId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  rawInput?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['typed', 'dictated', 'mixed'])
  inputMode?: string;

  @ApiPropertyOptional({ type: NoteSectionsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NoteSectionsDto)
  sections?: NoteSectionsDto;

  @ApiPropertyOptional({ type: NoteVitalsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NoteVitalsDto)
  vitals?: NoteVitalsDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['mock', 'real', 'manual'])
  structuringSource?: string;
}

export class NotesQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsMongoId() patientId?: string;
  @ApiPropertyOptional({ enum: ['draft', 'signed'] })
  @IsOptional()
  @IsIn(['draft', 'signed'])
  status?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  mine?: boolean;
}

export class RxItemDto {
  @ApiProperty({ example: 'Paracetamol' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  medicine: string;
  @ApiPropertyOptional({ example: 'Tablet' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  form?: string;
  @ApiPropertyOptional({ example: '500 mg' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  strength?: string;
  @ApiPropertyOptional({ example: '1 tablet' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  dose?: string;
  @ApiProperty({ example: '1-0-1' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  frequency: string;
  @ApiProperty({ example: '5 days' })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  duration: string;
  @ApiPropertyOptional({ example: 'Oral' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  route?: string;
  @ApiPropertyOptional({ example: 'After food' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  instructions?: string;
  @ApiPropertyOptional({ example: '10' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  quantity?: string;
}

export class CreatePrescriptionDto {
  @ApiProperty() @IsMongoId() patientId: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() appointmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() noteId?: string;

  @ApiProperty({ type: [RxItemDto] })
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => RxItemDto)
  items: RxItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  diagnosis?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  advice?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  investigations?: string[];

  @ApiPropertyOptional({ example: '2026-10-20' })
  @IsOptional()
  @IsISO8601()
  followUpDate?: string;
}

export class UpdatePrescriptionDto {
  @ApiPropertyOptional({ type: [RxItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => RxItemDto)
  items?: RxItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  diagnosis?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  advice?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  investigations?: string[];

  @ApiPropertyOptional() @IsOptional() @IsISO8601() followUpDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() appointmentId?: string;
}

export class PharmacyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
  @ApiProperty() @IsEmail() email: string;
}

export class SignPrescriptionDto {
  @ApiPropertyOptional({
    default: true,
    description: "Deliver the signed PDF to the patient's Medical Vault",
  })
  @IsOptional()
  @IsBoolean()
  sendToVault?: boolean;

  @ApiPropertyOptional({
    type: PharmacyDto,
    description: 'Also email the signed PDF to a pharmacy',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PharmacyDto)
  pharmacy?: PharmacyDto;
}

export class CancelPrescriptionDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(500) reason: string;
}

export class PrescriptionsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsMongoId() patientId?: string;
  @ApiPropertyOptional({ enum: ['draft', 'signed', 'cancelled'] })
  @IsOptional()
  @IsIn(['draft', 'signed', 'cancelled'])
  status?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  mine?: boolean;
}
