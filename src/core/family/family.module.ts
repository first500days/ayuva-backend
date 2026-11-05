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

@Module({
  imports: [
    AuthModule,
    AuditLogModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: HealthProfile.name, schema: HealthProfileSchema },
    ]),
  ],
  controllers: [FamilyController],
  providers: [FamilyService],
})
export class FamilyModule {}
