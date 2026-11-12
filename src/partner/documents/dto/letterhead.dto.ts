import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** Empty string clears a field. */
export class UpdateLetterheadDto {
  @ApiPropertyOptional({ example: 'Orange Labs & Diagnostics' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @ApiPropertyOptional({ example: 'NABL accredited · Since 1998' })
  @IsOptional()
  @IsString()
  @MaxLength(140)
  tagline?: string;

  @ApiPropertyOptional({ example: '12 MG Road, Bengaluru 560001' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  addressLine?: string;

  @ApiPropertyOptional({ example: '+91 80 1234 5678 · care@orangelabs.in' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactLine?: string;

  @ApiPropertyOptional({ example: 'Reg. no. KA/1234 · GSTIN 29ABCDE1234F1Z5' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  registrationLine?: string;

  @ApiPropertyOptional({ example: 'Open 24x7 · Home collection available' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  footerNote?: string;

  @ApiPropertyOptional({ example: '#0e7c7b' })
  @IsOptional()
  @Matches(/^(#[0-9a-fA-F]{6})?$/, {
    message: 'accentColor must be like #0e7c7b',
  })
  accentColor?: string;
}
