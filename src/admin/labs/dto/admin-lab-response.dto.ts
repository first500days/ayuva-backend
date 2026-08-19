import { ApiPropertyOptional } from '@nestjs/swagger';

export class AdminLabLocationResponseDto {
  @ApiPropertyOptional({ example: 'Bengaluru' })
  label?: string;

  @ApiPropertyOptional({ example: '123 MG Road' })
  address?: string;
}

export class AdminLabResponseDto {
  @ApiPropertyOptional({ example: '64f0c8e2b1a2c3d4e5f6a7b8' })
  id: string;

  @ApiPropertyOptional({ example: 'Ayuva Diagnostics' })
  name: string;

  @ApiPropertyOptional({ type: [String] })
  specialty: string[];

  @ApiPropertyOptional({ example: 'contact@lab.com' })
  email?: string;

  @ApiPropertyOptional({ example: '+91 98765 43210' })
  phone?: string;

  @ApiPropertyOptional({ type: [AdminLabLocationResponseDto] })
  locations: AdminLabLocationResponseDto[];

  @ApiPropertyOptional({ type: [String] })
  languages: string[];

  @ApiPropertyOptional({ example: 4.7 })
  rating: number;

  @ApiPropertyOptional({ enum: ['PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED', 'ACTIVE', 'INACTIVE'] })
  status: string;

  @ApiPropertyOptional({ example: 'https://cdn.ayuva.health/labs/l1.jpg' })
  profileImageUrl?: string;
}
