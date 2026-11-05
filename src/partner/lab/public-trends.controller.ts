import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
import { PartnerTrendLinksService } from './partner-trend-links.service';

class OpenTrendsDto {
  @ApiProperty({
    description: 'Last 4 digits of the mobile number on record, or birth year',
    example: '5678',
  })
  @IsString()
  @Matches(/^\s*\d{4}\s*$/, { message: 'Enter 4 digits' })
  answer: string;
}

/** The patient's trend page (no sign-in: the link plus a check on who they are). */
@ApiTags('Public - lab trends')
@Controller('public/trends')
export class PublicTrendsController {
  constructor(private readonly links: PartnerTrendLinksService) {}

  @Get(':token')
  @ApiOperation({ summary: 'Which lab, and what the patient will be asked' })
  info(@Param('token') token: string) {
    return this.links.info(token);
  }

  @Post(':token/open')
  @HttpCode(200)
  @ApiOperation({
    summary: "The patient's results over time, after they confirm who they are",
  })
  open(@Param('token') token: string, @Body() dto: OpenTrendsDto) {
    return this.links.open(token, dto.answer);
  }
}
