import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AdminUserStatus } from '../../../core/admin-users/schemas/admin-user.schema';

export class QueryAdminAdminUsersDto {
  @ApiPropertyOptional({ example: 'admin@ayuva.health' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: AdminUserStatus })
  @IsOptional()
  @IsEnum(AdminUserStatus)
  status?: AdminUserStatus;
}
