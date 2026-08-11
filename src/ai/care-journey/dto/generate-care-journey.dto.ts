import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

// POST /care-journey/generate (TRD §4.2, §5.2).
export class GenerateCareJourneyDto {
  @ApiProperty({ example: '64f0c8e2b1a2c3d4e5f6a7b9' })
  @IsMongoId()
  triageResultId: string;
}
