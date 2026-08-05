import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CreateProviderDto } from '../../../core/providers/dto/create-provider.dto';
import { ProviderStatus } from '../../../core/providers/schemas/provider.schema';

// FR-13.2/13.3: add a provider, with per-provider config (specialties, locations,
// languages, fee, profile image) plus an admin-settable initial status.
export class AdminCreateProviderDto extends CreateProviderDto {
  @ApiPropertyOptional({ enum: ProviderStatus })
  @IsOptional()
  @IsEnum(ProviderStatus)
  status?: ProviderStatus;

  @ApiPropertyOptional({ example: 'https://cdn.ayuva.health/providers/p1.jpg' })
  @IsOptional()
  @IsString()
  profileImageUrl?: string;
}
