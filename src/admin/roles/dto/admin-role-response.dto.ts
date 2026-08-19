import { ApiPropertyOptional } from '@nestjs/swagger';

export class AdminRoleResponseDto {
  @ApiPropertyOptional({ example: '64f0c8e2b1a2c3d4e5f6a7b8' })
  id: string;

  @ApiPropertyOptional({ example: 'Medical Reviewer' })
  name: string;

  @ApiPropertyOptional({ example: 'Can review medical records and AI outputs' })
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  permissions: string[];

  @ApiPropertyOptional()
  isSystem: boolean;
}
