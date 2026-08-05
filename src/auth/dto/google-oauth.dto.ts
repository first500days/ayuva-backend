import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsString, ValidateNested } from 'class-validator';
import { ConsentDto } from './consent.dto';

export class GoogleOAuthDto {
  @ApiProperty({
    description:
      'Google ID token obtained from the client-side Google Sign-In SDK',
  })
  @IsString()
  @IsNotEmpty()
  idToken: string;

  @ApiProperty({
    type: ConsentDto,
    description:
      'Required in case this token creates a brand-new account (FR-1.5); ignored on subsequent logins.',
  })
  @ValidateNested()
  @Type(() => ConsentDto)
  consent: ConsentDto;
}
