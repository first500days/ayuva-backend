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
import { CreateFamilyMemberDto, UpdateFamilyMemberDto } from './dto/family.dto';

/**
 * The signed-in person's family profiles. Always about the account holder:
 * the profile switch (X-Ayuva-Profile) never applies here.
 */
@ApiTags('Family profiles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ConsentGuard)
@Controller('family')
export class FamilyController {
  constructor(private readonly family: FamilyService) {}

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
}
