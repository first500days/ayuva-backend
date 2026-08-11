import { ApiProperty } from '@nestjs/swagger';

export class ConsentStatusResponseDto {
  @ApiProperty({ example: '2026-01-01' })
  version: string;

  @ApiProperty({ example: '2026-08-11T10:00:00.000Z' })
  acceptedAt: string;
}
