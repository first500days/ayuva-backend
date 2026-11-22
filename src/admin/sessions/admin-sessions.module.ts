import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLogModule } from '../../audit-log/audit-log.module';
import { AuthModule } from '../../auth/auth.module';
import {
  Provider,
  ProviderSchema,
} from '../../core/providers/schemas/provider.schema';
import {
  PartnerMember,
  PartnerMemberSchema,
} from '../../partner/staff/schemas/partner-member.schema';
import {
  AdminOrgSessionsController,
  AdminUserSessionsController,
} from './admin-sessions.controller';
import { AdminSessionsService } from './admin-sessions.service';
import { User, UserSchema } from '../../core/users/schemas/user.schema';

/** Session revocation from the Admin Panel's user and provider grids. */
@Module({
  imports: [
    AuthModule,
    AuditLogModule,
    MongooseModule.forFeature([
      { name: PartnerMember.name, schema: PartnerMemberSchema },
      { name: Provider.name, schema: ProviderSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [AdminUserSessionsController, AdminOrgSessionsController],
  providers: [AdminSessionsService],
})
export class AdminSessionsModule {}
