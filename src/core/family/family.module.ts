import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../../auth/auth.module';
import { AuditLogModule } from '../../audit-log/audit-log.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  HealthProfile,
  HealthProfileSchema,
} from '../health-profile/schemas/health-profile.schema';
import { FamilyController } from './family.controller';
import { FamilyService } from './family.service';
import { FamilyAccessService } from './family-access.service';
import {
  FamilyAccess,
  FamilyAccessSchema,
} from './schemas/family-access.schema';

@Module({
  imports: [
    AuthModule,
    AuditLogModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: HealthProfile.name, schema: HealthProfileSchema },
      { name: FamilyAccess.name, schema: FamilyAccessSchema },
    ]),
  ],
  controllers: [FamilyController],
  providers: [FamilyService, FamilyAccessService],
})
export class FamilyModule {}
