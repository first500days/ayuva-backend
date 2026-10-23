import { ApiProperty } from '@nestjs/swagger';

export { MedicationResponseDto } from '../../medications/dto/medication-response.dto';

export class HealthProfileResponseDto {
  @ApiProperty({ example: 42, description: 'Derived from dateOfBirth when set; 0 when unknown' })
  age: number;

  @ApiProperty({ example: '1984-03-09', nullable: true, type: String })
  dateOfBirth: string | null;

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
