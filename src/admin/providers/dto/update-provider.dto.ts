import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CreateProviderDto } from '../../../core/providers/dto/create-provider.dto';
import { ProviderStatus } from '../../../core/providers/schemas/provider.schema';

// FR-13.2/13.3: edit any provider field, including status to activate/deactivate (FR-13.4).
export class UpdateProviderDto extends PartialType(CreateProviderDto) {
  @ApiPropertyOptional({ enum: ProviderStatus })
  @IsOptional()
  @IsEnum(ProviderStatus)
  status?: ProviderStatus;

  @ApiPropertyOptional({ example: 'https://cdn.ayuva.health/providers/p1.jpg' })
  @IsOptional()
  @IsString()
  profileImageUrl?: string;
}
