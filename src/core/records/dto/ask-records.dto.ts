import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { MedicalRecordResponseDto } from './medical-record-response.dto';

export class AskRecordsDto {
  @ApiProperty({ example: 'When was my last blood test?' })
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  question: string;
}

export class AskRecordsResponseDto {
  @ApiProperty({
    example:
      'Your most recent lab report is "CBC.pdf", dated 2 Nov 2026, from Metropolis Healthcare.',
  })
  answer: string;

  @ApiProperty({
    enum: ['dates', 'count', 'values', 'search'],
    description: 'How the answer was found',
  })
  basis: 'dates' | 'count' | 'values' | 'search';

  @ApiProperty({
    type: [MedicalRecordResponseDto],
    description: 'The records the answer comes from (at most 5)',
  })
  records: MedicalRecordResponseDto[];
}
