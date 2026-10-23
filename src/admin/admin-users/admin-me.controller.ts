import { Controller, Get, NotFoundException, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Model } from 'mongoose';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { User, UserDocument, UserRole } from '../../core/users/schemas/user.schema';
import { AdminAccessService } from '../../auth/services/admin-access.service';

/**
 * Who the signed-in admin is and which Admin Panel modules their role opens.
 * The admin sidebar renders from `modules`; the API enforces the same table.
 */
@ApiTags('Admin - Me')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/me')
export class AdminMeController {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly adminAccess: AdminAccessService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Signed-in admin's role, permissions and allowed modules" })
  async me(@CurrentUser() payload: JwtPayload) {
    const user = await this.userModel.findById(payload.sub).select('fullName email mfa').exec();
    if (!user) throw new NotFoundException('Admin account not found');
    const access = await this.adminAccess.resolve(user);
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      roleName: access.roleName,
      permissions: access.permissions,
      modules: access.modules,
      mfa: {
        enrolled: !!user.mfa?.enabled,
        enrolledAt: user.mfa?.enrolledAt?.toISOString() ?? null,
      },
    };
  }
}
