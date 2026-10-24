import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Provider,
  ProviderSchema,
} from '../../core/providers/schemas/provider.schema';
import {
  AppointmentSlot,
  AppointmentSlotSchema,
} from '../../core/providers/schemas/appointment-slot.schema';
import {
  ShareOrganisation,
  ShareOrganisationSchema,
} from '../../core/sharing/schemas/share-organisation.schema';
import {
  Appointment,
  AppointmentSchema,
} from '../../core/appointments/schemas/appointment.schema';
import {
  PartnerMember,
  PartnerMemberSchema,
} from '../../partner/staff/schemas/partner-member.schema';
import { AuthModule } from '../../auth/auth.module';
import { AuditLogModule } from '../../audit-log/audit-log.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { AdminProvidersController } from './admin-providers.controller';
import { AdminProvidersService } from './admin-providers.service';
import { AdminDoctorRegistrationsController } from './admin-doctor-registrations.controller';
import { AdminDoctorRegistrationsService } from './admin-doctor-registrations.service';

@Module({
  imports: [
    AuthModule,
    AuditLogModule,
    NotificationsModule,
    MongooseModule.forFeature([
      { name: Provider.name, schema: ProviderSchema },
      { name: AppointmentSlot.name, schema: AppointmentSlotSchema },
      { name: ShareOrganisation.name, schema: ShareOrganisationSchema },
      { name: PartnerMember.name, schema: PartnerMemberSchema },
      { name: Appointment.name, schema: AppointmentSchema },
    ]),
  ],
  controllers: [AdminProvidersController, AdminDoctorRegistrationsController],
  providers: [AdminProvidersService, AdminDoctorRegistrationsService],
  exports: [AdminProvidersService],
})
export class AdminProvidersModule {}
