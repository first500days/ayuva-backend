import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CredentialDocType } from '../../../core/providers/schemas/provider.schema';

export const MAX_CREDENTIAL_BYTES = 10 * 1024 * 1024; // 10MB

/** Multipart fields sent alongside the uploaded licence / registration file. */
export class UploadCredentialDto {
  @ApiPropertyOptional({ enum: CredentialDocType, default: CredentialDocType.MEDICAL_LICENSE })
  @IsOptional()
  @IsEnum(CredentialDocType)
  docType?: CredentialDocType;
}

export class SuspendProviderDto {
  @ApiProperty({
    example: 'Medical council registration could not be re-verified',
    description: 'Recorded on the provider and in the audit log',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}
