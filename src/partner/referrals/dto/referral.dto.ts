import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  ReferralPriority,
  ReferralStatus,
  ReferralType,
} from '../schemas/referral.schema';

export class ExternalTargetDto {
  @ApiProperty({ example: 'City Heart Institute' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;
}

export class CreateReferralDto {
  @ApiProperty() @IsMongoId() patientId: string;

  @ApiPropertyOptional({
    description: 'An Ayuva partner organisation (from the directory)',
  })
  @IsOptional()
  @IsMongoId()
  toProviderId?: string;

  @ApiPropertyOptional({
    type: ExternalTargetDto,
    description: 'A provider outside Ayuva',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExternalTargetDto)
  toExternal?: ExternalTargetDto;

  @ApiProperty({ enum: ReferralType }) @IsEnum(ReferralType) type: ReferralType;
  @ApiProperty({ enum: ReferralPriority })
  @IsEnum(ReferralPriority)
  priority: ReferralPriority;
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(2000) reason: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(6000)
  clinicalSummary?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  requestedTests?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  department?: string;
}

export class RespondReferralDto {
  @ApiProperty({ enum: ['accept', 'decline'] })
  @IsIn(['accept', 'decline'])
  decision: 'accept' | 'decline';
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class ReferralNoteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class ReferralsQueryDto {
  @ApiPropertyOptional({ enum: ['outgoing', 'incoming'] })
  @IsOptional()
  @IsIn(['outgoing', 'incoming'])
  direction?: 'outgoing' | 'incoming';

  @ApiPropertyOptional({ enum: ReferralStatus })
  @IsOptional()
  @IsEnum(ReferralStatus)
  status?: ReferralStatus;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() patientId?: string;
}

export class DirectoryQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) q?: string;

  @ApiPropertyOptional({ enum: ['clinic', 'hospital', 'diagnostic'] })
  @IsOptional()
  @IsIn(['clinic', 'hospital', 'diagnostic'])
  type?: 'clinic' | 'hospital' | 'diagnostic';
}
