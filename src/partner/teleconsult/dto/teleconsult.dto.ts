import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsBoolean, IsMongoId, IsOptional } from 'class-validator';

export class StartTeleconsultDto {
  @ApiProperty() @IsMongoId() patientId: string;

  @ApiPropertyOptional() @IsOptional() @IsMongoId() appointmentId?: string;

  @ApiProperty({
    description: 'The patient agreed to a video consultation (must be true)',
  })
  @IsBoolean()
  @Equals(true, {
    message: "Record the patient's consent to a video consultation first",
  })
  consent: boolean;
}
