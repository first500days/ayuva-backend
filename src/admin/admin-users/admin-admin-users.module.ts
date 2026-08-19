import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminUser, AdminUserSchema } from '../../core/admin-users/schemas/admin-user.schema';
import { AdminAdminUsersController } from './admin-admin-users.controller';
import { AdminAdminUsersService } from './admin-admin-users.service';
import { AuthModule } from '../../auth/auth.module';
import { AuditLogModule } from '../../audit-log/audit-log.module';

@Module({
  imports: [
    AuthModule,
    AuditLogModule,
    MongooseModule.forFeature([{ name: AdminUser.name, schema: AdminUserSchema }]),
  ],
  controllers: [AdminAdminUsersController],
  providers: [AdminAdminUsersService],
  exports: [AdminAdminUsersService],
})
export class AdminAdminUsersModule {}
