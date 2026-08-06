import { ApiProperty } from '@nestjs/swagger';
import { IsPhoneNumber, IsString } from 'class-validator';

export class CreateEmergencyContactDto {
  @ApiProperty({ example: 'Chidi Okafor' })
  @IsString()
  name: string;

  @ApiProperty({ example: '9876543210' })
  @IsPhoneNumber('IN')
  phone: string;
}
