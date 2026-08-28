import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ConsentGuard } from '../../auth/guards/consent.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { SharingService } from './sharing.service';
import {
  AccessLogResponseDto,
  CreateGrantDto,
  ShareGrantResponseDto,
  ShareOrganisationResponseDto,
} from './dto/sharing.dto';

@ApiTags('Sharing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ConsentGuard)
@Controller('sharing')
export class SharingController {
  constructor(private readonly sharingService: SharingService) {}

  @Get('organisations')
  @ApiOperation({ summary: 'List connected sharing organisations (§7.13)' })
  @ApiOkResponse({ type: [ShareOrganisationResponseDto] })
  listOrganisations(): Promise<ShareOrganisationResponseDto[]> {
    return this.sharingService.listOrganisations();
  }

  @Get('grants')
  @ApiOperation({ summary: "List user's active sharing grants (§10)" })
  @ApiOkResponse({ type: [ShareGrantResponseDto] })
  listGrants(@CurrentUser() user: JwtPayload): Promise<ShareGrantResponseDto[]> {
    return this.sharingService.listGrants(user.sub);
  }

  @Get('grants/:id')
  @ApiOperation({ summary: 'Get a single sharing grant' })
  @ApiOkResponse({ type: ShareGrantResponseDto })
  getGrant(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<ShareGrantResponseDto> {
    return this.sharingService.getGrant(user.sub, id);
  }

  @Post('grants')
  @ApiOperation({ summary: 'Create a new sharing grant (§10 explicit consent)' })
  @ApiCreatedResponse({ type: ShareGrantResponseDto })
  createGrant(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateGrantDto,
  ): Promise<ShareGrantResponseDto> {
    return this.sharingService.createGrant(user.sub, dto);
  }

  @Post('grants/:id/revoke')
  @ApiOperation({ summary: 'Revoke an active sharing grant (§10)' })
  @ApiOkResponse({ type: ShareGrantResponseDto })
  revokeGrant(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<ShareGrantResponseDto> {
    return this.sharingService.revokeGrant(user.sub, id);
  }

  @Get('access-log')
  @ApiOperation({ summary: "User-visible sharing access log (§7.13 audit)" })
  @ApiOkResponse({ type: [AccessLogResponseDto] })
  getAccessLog(@CurrentUser() user: JwtPayload): Promise<AccessLogResponseDto[]> {
    return this.sharingService.getAccessLog(user.sub);
  }
}
