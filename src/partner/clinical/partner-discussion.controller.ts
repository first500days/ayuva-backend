import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../core/users/schemas/user.schema';
import {
  PartnerCtx,
  PartnerPermGuard,
  RequirePerm,
} from '../rbac/partner-perm.guard';
import type { PartnerActor } from '../rbac/partner-perm.guard';
import { Perm } from '../rbac/partner-permissions';
import { PartnerDiscussionService } from './partner-discussion.service';
import { PostCaseMessageDto } from './dto/discussion.dto';

/** Internal case discussion between clinicians, with @mentions. */
@ApiTags('Partner - Case discussion')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PartnerPermGuard)
@Roles(UserRole.PARTNER)
@Controller('partner')
export class PartnerDiscussionController {
  constructor(private readonly discussion: PartnerDiscussionService) {}

  @Get('discussion/members')
  @RequirePerm(Perm.RECORDS_VIEW)
  @ApiOperation({ summary: 'Colleagues who can be @mentioned' })
  members(@PartnerCtx() a: PartnerActor) {
    return this.discussion.mentionable(a);
  }

  @Get('patients/:id/discussion')
  @RequirePerm(Perm.RECORDS_VIEW)
  list(@PartnerCtx() a: PartnerActor, @Param('id') id: string) {
    return this.discussion.list(a, id);
  }

  @Post('patients/:id/discussion')
  @RequirePerm(Perm.RECORDS_VIEW)
  @ApiOperation({
    summary:
      'Post to the case discussion; @mentioned colleagues are notified (email/SMS without patient details)',
  })
  post(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: PostCaseMessageDto,
  ) {
    return this.discussion.post(a, id, dto);
  }

  @Post('discussion/:messageId/remove')
  @HttpCode(200)
  @RequirePerm(Perm.RECORDS_VIEW)
  remove(@PartnerCtx() a: PartnerActor, @Param('messageId') id: string) {
    return this.discussion.remove(a, id);
  }
}
