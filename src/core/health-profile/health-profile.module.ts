import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  HealthProfile,
  HealthProfileSchema,
} from './schemas/health-profile.schema';
import {
  EmergencyContact,
  EmergencyContactSchema,
} from './schemas/emergency-contact.schema';

/** Schema registration only. PUT /profile/health etc. (TRD §4.1) land in Phase 2. */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: HealthProfile.name, schema: HealthProfileSchema },
      { name: EmergencyContact.name, schema: EmergencyContactSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class HealthProfileModule {}
