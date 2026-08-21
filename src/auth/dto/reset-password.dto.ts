import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';
import { IsStrongPassword } from '../../common/validators/is-strong-password.decorator';

export class ResetPasswordDto {
  @ApiProperty({ example: 'amara.o@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: '482913',
    description: 'The code emailed by POST /auth/forgot-password',
  })
  @IsString()
  code: string;

  @ApiProperty({ example: 'newSecurePass123', minLength: 8 })
  @IsStrongPassword()
  newPassword: string;
}
