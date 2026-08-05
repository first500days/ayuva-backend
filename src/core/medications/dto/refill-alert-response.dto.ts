import { ApiProperty } from '@nestjs/swagger';

export class RefillAlertResponseDto {
  @ApiProperty({ example: '64f0c8e2b1a2c3d4e5f6a7b8' })
  medicationId: string;

  @ApiProperty({ example: 'Salbutamol Inhaler' })
  name: string;

  @ApiProperty({ example: '2 puffs' })
  dosage: string;

  @ApiProperty({ example: 2 })
  suppliesRemainingDays: number;

  @ApiProperty({ example: 3 })
  refillThresholdDays: number;

  @ApiProperty({ example: '2 days left' })
  label: string;
}
