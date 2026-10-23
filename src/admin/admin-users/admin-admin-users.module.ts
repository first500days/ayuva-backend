import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminUser, AdminUserSchema } from '../../core/admin-users/schemas/admin-user.schema';
import { User, UserSchema } from '../../core/users/schemas/user.schema';
import { Role, RoleSchema } from '../../core/roles/schemas/role.schema';
import { AdminAdminUsersController } from './admin-admin-users.controller';
import { AdminMeController } from './admin-me.controller';
import { AdminAdminUsersService } from './admin-admin-users.service';
import { AuthModule } from '../../auth/auth.module';
import { AuditLogModule } from '../../audit-log/audit-log.module';

@Module({
  imports: [
    AuthModule,
    AuditLogModule,
    MongooseModule.forFeature([
      { name: AdminUser.name, schema: AdminUserSchema },
      // Each directory entry is linked to the admin login it signs in with.
      { name: User.name, schema: UserSchema },
      { name: Role.name, schema: RoleSchema },
    ]),
  ],
  controllers: [AdminAdminUsersController, AdminMeController],
  providers: [AdminAdminUsersService],
  exports: [AdminAdminUsersService],
})
export class AdminAdminUsersModule {}
