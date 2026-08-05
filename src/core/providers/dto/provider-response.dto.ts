import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProviderCategory } from '../schemas/provider.schema';
import { ProviderLocationDto } from './create-provider.dto';

export class ProviderResponseDto {
  @ApiProperty({ example: '64f0c8e2b1a2c3d4e5f6a7b8' })
  id: string;

  @ApiProperty({ example: 'Dr. Priya Menon' })
  name: string;

  @ApiProperty({ enum: ProviderCategory })
  type: ProviderCategory;

  @ApiProperty({
    type: [String],
    example: ['Cardiologist', 'Heart & Vascular'],
  })
  specialty: string[];

  @ApiProperty({ type: [ProviderLocationDto] })
  locations: ProviderLocationDto[];

  @ApiProperty({ type: [String], example: ['EN', 'HI', 'TA'] })
  languages: string[];

  @ApiProperty({ example: 4.9 })
  rating: number;

  @ApiProperty({ example: 2880, description: 'Average wait, in minutes' })
  avgWaitMinutes: number;

  @ApiPropertyOptional({ example: 50 })
  consultationFee?: number;

  @ApiProperty({
    example: true,
    description:
      'Whether the current patient has saved/bookmarked this provider (FR-6.5)',
  })
  saved: boolean;
}
