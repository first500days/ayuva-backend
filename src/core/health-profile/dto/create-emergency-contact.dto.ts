import { ApiProperty } from '@nestjs/swagger';
import { IsPhoneNumber, IsString } from 'class-validator';

export class CreateEmergencyContactDto {
  @ApiProperty({ example: 'Chidi Okafor' })
  @IsString()
  name: string;

  @ApiProperty({ example: '+44 7700 900123' })
  @IsPhoneNumber()
  phone: string;
}
