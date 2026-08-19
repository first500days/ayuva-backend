import { PartialType } from '@nestjs/swagger';
import { CreateAdminUserDto } from './create-admin-user.dto';
import { AdminUserStatus } from '../../../core/admin-users/schemas/admin-user.schema';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateAdminUserDto extends PartialType(CreateAdminUserDto) {
  @ApiPropertyOptional({ enum: AdminUserStatus })
  status?: AdminUserStatus;
}
