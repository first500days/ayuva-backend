import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsOptional, ValidateIf } from 'class-validator';

// POST /care-journey/generate (TRD §4.2, §5.2). The app starts a pathway from
// "Ask AYUVA" (intentId); the older symptom flow sends a triageResultId.
export class GenerateCareJourneyDto {
  @ApiPropertyOptional({ example: '64f0c8e2b1a2c3d4e5f6a7b9' })
  @IsOptional()
  @IsMongoId()
  triageResultId?: string;

  @ApiPropertyOptional({ example: '64f0c8e2b1a2c3d4e5f6a7b8' })
  @ValidateIf((o: GenerateCareJourneyDto) => !o.triageResultId)
  @IsMongoId()
  intentId?: string;
}
