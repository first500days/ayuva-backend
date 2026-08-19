import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsString, IsArray, IsOptional } from 'class-validator';

export class CreateAdminUserDto {
  @ApiProperty({ example: 'admin@ayuva.health' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Super Admin' })
  @IsString()
  fullName: string;

  @ApiPropertyOptional({ example: '64f0c8e2b1a2c3d4e5f6a7ba' })
  @IsOptional()
  @IsString()
  roleId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}
