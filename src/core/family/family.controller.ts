import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ConsentGuard } from '../../auth/guards/consent.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { FamilyService } from './family.service';
import {
  CreateFamilyMemberDto,
  GrantFamilyAccessDto,
  UpdateFamilyAccessDto,
  UpdateFamilyMemberDto,
} from './dto/family.dto';
import { FamilyAccessService } from './family-access.service';

/**
 * The signed-in person's family profiles. Always about the account holder:
 * the profile switch (X-Ayuva-Profile) never applies here.
 */
@ApiTags('Family profiles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ConsentGuard)
@Controller('family')
export class FamilyController {
  constructor(
    private readonly family: FamilyService,
    private readonly access: FamilyAccessService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'You and the family members you manage' })
  list(@CurrentUser() user: JwtPayload) {
    return this.family.list(user.sub);
  }

  @Post()
  @ApiOperation({
    summary:
      'Add a family member (their own records and appointments, managed by you; no sign-in of their own)',
  })
  add(@CurrentUser() user: JwtPayload, @Body() dto: CreateFamilyMemberDto) {
    return this.family.add(user.sub, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateFamilyMemberDto,
  ) {
    return this.family.update(user.sub, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.family.remove(user.sub, id);
  }

  @Get(':id/access')
  @ApiOperation({
    summary:
      'Other accounts with access to this family profile, and their level',
  })
  accessList(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.access.list(user.sub, id);
  }

  @Post(':id/access')
  @ApiOperation({
    summary:
      "Give another AYUVA account access to this family profile: 'view' (read only) or 'manage' (book, cancel, upload, share)",
  })
  grant(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: GrantFamilyAccessDto,
  ) {
    return this.access.grant(user.sub, id, dto.email, dto.level);
  }

  @Patch(':id/access/:accessId')
  setLevel(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('accessId') accessId: string,
    @Body() dto: UpdateFamilyAccessDto,
  ) {
    return this.access.setLevel(user.sub, id, accessId, dto.level);
  }

  @Delete(':id/access/:accessId')
  revoke(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('accessId') accessId: string,
  ) {
    return this.access.revoke(user.sub, id, accessId);
  }
}
