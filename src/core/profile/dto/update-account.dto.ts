import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

/**
 * The account fields a patient may change about themselves. Email is
 * deliberately absent — it is the login identifier and changing it is a
 * re-verification flow, not a profile edit.
 */
export class UpdateAccountDto {
  @ApiProperty({ example: 'Amara Okafor' })
  @IsString()
  @MinLength(2)
  fullName: string;
}
