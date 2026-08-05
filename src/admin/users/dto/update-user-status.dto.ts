import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { UserStatus } from '../../../core/users/schemas/user.schema';

export class UpdateUserStatusDto {
  @ApiProperty({
    enum: UserStatus,
    description: 'Activate/deactivate a patient account (FR-12.2)',
  })
  @IsEnum(UserStatus)
  status: UserStatus;
}
