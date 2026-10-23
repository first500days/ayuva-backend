import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsString, IsArray, IsMongoId, IsOptional } from 'class-validator';

export class CreateAdminUserDto {
  @ApiProperty({ example: 'admin@ayuva.health' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Super Admin' })
  @IsString()
  fullName: string;

  // Every new admin gets a role: it decides which modules they can open.
  @ApiProperty({ example: '64f0c8e2b1a2c3d4e5f6a7ba' })
  @IsMongoId({ message: 'Choose a role for this admin user' })
  roleId: string;

  @ApiPropertyOptional({ type: [String], description: 'Extra permissions on top of the role' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}
