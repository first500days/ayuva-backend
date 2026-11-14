import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsMongoId, IsOptional, Matches } from 'class-validator';
import { ConsentGuard } from '../../../auth/guards/consent.guard';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../../../auth/interfaces/jwt-payload.interface';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { WaitlistService } from './waitlist.service';

export class JoinWaitlistDto {
  @IsMongoId()
  providerId: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fromDay?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  toDay?: string;
}

@ApiTags('Appointments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ConsentGuard)
@Controller('appointments/waitlist')
export class WaitlistController {
  constructor(private readonly waitlist: WaitlistService) {}

  @Get()
  @ApiOperation({ summary: 'Providers I am waiting for an opening with' })
  mine(@CurrentUser() user: JwtPayload) {
    return this.waitlist.mine(user.sub);
  }

  @Post()
  @ApiOperation({
    summary:
      'Wait for an opening with a provider (optionally between two days); a push arrives when a slot frees up',
  })
  join(@CurrentUser() user: JwtPayload, @Body() dto: JoinWaitlistDto) {
    return this.waitlist.join(user.sub, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Stop waiting' })
  leave(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.waitlist.leave(user.sub, id);
  }
}
