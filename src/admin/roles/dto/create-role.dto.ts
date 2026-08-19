import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsArray, IsOptional } from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ example: 'Medical Reviewer' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Can review medical records and AI outputs' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}
