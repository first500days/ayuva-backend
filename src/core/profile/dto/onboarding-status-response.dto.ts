import { ApiProperty } from '@nestjs/swagger';

export { MedicationResponseDto } from '../../medications/dto/medication-response.dto';

export class HealthProfileResponseDto {
  @ApiProperty({ example: 42 })
  age: number;

  @ApiProperty({ example: 'Female' })
  gender: string;

  @ApiProperty({ type: [String], example: ['Hypertension', 'Mild Asthma'] })
  conditions: string[];

  @ApiProperty({ type: [String], example: ['Penicillin', 'Peanuts'] })
  allergies: string[];
}

export class EmergencyContactResponseDto {
  @ApiProperty({ example: 'Chidi Okafor' })
  name: string;

  @ApiProperty({ example: '+44 7700 900123' })
  phone: string;
}
