import { ApiProperty } from '@nestjs/swagger';

export class MedicationResponseDto {
  @ApiProperty({ example: '64f0c8e2b1a2c3d4e5f6a7b8' })
  id: string;

  @ApiProperty({ example: 'Amlodipine' })
  name: string;

  @ApiProperty({ example: '5 mg' })
  dosage: string;

  @ApiProperty({ example: 'Once daily · morning' })
  frequency: string;

  @ApiProperty({ type: [String], example: ['08:00'] })
  scheduleTimes: string[];

  @ApiProperty({ example: true })
  active: boolean;
}
