import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class AnalyseNavIntentDto {
  @ApiProperty({ example: 'I have chest pain and need to see a cardiologist today' })
  @IsString()
  @MinLength(1)
  rawText: string;
}

export class SuggestedFiltersDto {
  @ApiProperty()
  label: string;
  @ApiPropertyOptional()
  specialty?: string;
  @ApiPropertyOptional()
  type?: string;
  @ApiPropertyOptional({ enum: ['today', 'tomorrow', 'this_week'] })
  availability?: string;
  @ApiPropertyOptional()
  maxFee?: number;
}

export class NavActionDto {
  @ApiProperty()
  id: string;
  @ApiProperty()
  label: string;
  @ApiProperty()
  description: string;
  @ApiProperty({ description: 'MaterialIcons glyph' })
  icon: string;
  @ApiProperty()
  route: string;
  @ApiPropertyOptional()
  params?: Record<string, string>;
  @ApiProperty({ enum: ['marketplace', 'tests', 'records', 'journey', 'chat'] })
  kind: string;
  @ApiPropertyOptional()
  primary?: boolean;
}

export class RelatedTestDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() fromPrice: number;
}

export class NavIntentResponseDto {
  @ApiProperty()
  id: string;
  @ApiProperty({ type: [String] })
  understood: string[];
  @ApiProperty()
  summary: string;
  @ApiProperty({ type: SuggestedFiltersDto })
  suggestedFilters: SuggestedFiltersDto;
  @ApiProperty({ type: [NavActionDto] })
  suggestedActions: NavActionDto[];
  @ApiProperty({ type: [RelatedTestDto] })
  relatedTests: RelatedTestDto[];
  @ApiProperty({ enum: ['mock', 'real'] })
  source: string;
  @ApiProperty()
  disclaimer: string;
}
