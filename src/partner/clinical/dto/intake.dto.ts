import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class IntakeScanDto {
  @ApiProperty({
    description: 'The text of the QR the patient shows (starts AYV1.)',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  code: string;
}
