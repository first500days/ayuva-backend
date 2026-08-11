import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, Min } from 'class-validator';
import { CareStepStatus } from '../schemas/care-journey.schema';

// PATCH /care-journey/:id/steps — real, user-driven persisted state (not AI output).
export class UpdateCareStepDto {
  @ApiProperty({ example: 0, description: 'Index into the journey.steps array' })
  @IsInt()
  @Min(0)
  stepIndex: number;

  @ApiProperty({ enum: CareStepStatus })
  @IsEnum(CareStepStatus)
  status: CareStepStatus;
}
