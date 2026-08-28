import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PrepPackItemDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: ['record', 'medication', 'condition', 'allergy', 'question', 'summary'] })
  kind: string;
  @ApiProperty() title: string;
  @ApiPropertyOptional() detail?: string;
  @ApiPropertyOptional() recordId?: string;
  @ApiPropertyOptional() date?: string;
  @ApiProperty() included: boolean;
}

export class PrepPackSectionDto {
  @ApiProperty({ enum: ['record', 'medication', 'condition', 'allergy', 'question', 'summary'] })
  kind: string;
  @ApiProperty() title: string;
  @ApiProperty() description: string;
  @ApiProperty({ type: [PrepPackItemDto] }) items: PrepPackItemDto[];
}

export class PrepPackResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() appointmentId: string;
  @ApiProperty() providerName: string;
  @ApiProperty() specialty: string;
  @ApiProperty() appointmentDate: string;
  @ApiProperty() appointmentTime: string;
  @ApiProperty({ type: [PrepPackSectionDto] }) sections: PrepPackSectionDto[];
  @ApiProperty({ enum: ['mock', 'real'] }) source: string;
  @ApiProperty() disclaimer: string;
}
