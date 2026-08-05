import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../core/users/schemas/user.schema';

export class AuthUserDto {
  @ApiProperty({ example: '64f0c8e2b1a2c3d4e5f6a7b8' })
  id: string;

  @ApiProperty({ example: 'Amara Okafor' })
  fullName: string;

  @ApiProperty({ example: 'amara.o@example.com' })
  email: string;

  @ApiProperty({ enum: UserRole })
  role: UserRole;

  @ApiProperty({
    example: false,
    description:
      'True until a HealthProfile exists — onboarding is skippable (FR-2.6), never a hard gate.',
  })
  onboardingComplete: boolean;
}

export class AuthTokensResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty({ type: AuthUserDto })
  user: AuthUserDto;
}
