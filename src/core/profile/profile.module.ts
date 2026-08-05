import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  HealthProfile,
  HealthProfileSchema,
} from '../health-profile/schemas/health-profile.schema';
import {
  EmergencyContact,
  EmergencyContactSchema,
} from '../health-profile/schemas/emergency-contact.schema';
import {
  Medication,
  MedicationSchema,
} from '../medications/schemas/medication.schema';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { AuthModule } from '../../auth/auth.module';
import { NotificationsModule } from '../../notifications/notifications.module';

@Module({
  imports: [
    AuthModule,
    NotificationsModule,
    MongooseModule.forFeature([
      { name: HealthProfile.name, schema: HealthProfileSchema },
      { name: EmergencyContact.name, schema: EmergencyContactSchema },
      { name: Medication.name, schema: MedicationSchema },
    ]),
  ],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
