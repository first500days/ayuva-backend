import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminProvidersModule } from '../admin/providers/admin-providers.module';
import { SharingModule } from '../core/sharing/sharing.module';
import { User, UserSchema } from '../core/users/schemas/user.schema';
import { Provider, ProviderSchema } from '../core/providers/schemas/provider.schema';
import {
  AppointmentSlot,
  AppointmentSlotSchema,
} from '../core/providers/schemas/appointment-slot.schema';
import { Appointment, AppointmentSchema } from '../core/appointments/schemas/appointment.schema';
import { Transaction, TransactionSchema } from '../core/payments/schemas/transaction.schema';
import { ShareGrant, ShareGrantSchema } from '../core/sharing/schemas/share-grant.schema';
import {
  ShareOrganisation,
  ShareOrganisationSchema,
} from '../core/sharing/schemas/share-organisation.schema';
import { AccessLog, AccessLogSchema } from '../core/sharing/schemas/access-log.schema';
import { MedicalRecord, MedicalRecordSchema } from '../core/records/schemas/medical-record.schema';
import { PartnerAuthController, PartnerController } from './partner.controller';
import { PartnerContextService } from './partner-context.service';
import { PartnerAuthService } from './partner-auth.service';
import { PartnerProfileService } from './partner-profile.service';
import { PartnerAppointmentsService } from './partner-appointments.service';
import { PartnerRecordsService } from './partner-records.service';
import { PartnerPaymentsService } from './partner-payments.service';

/** Partner Portal API (Product Journey §2, wireframes P01–P06). */
@Module({
  imports: [
    AuthModule,
    AuditLogModule,
    NotificationsModule,
    AdminProvidersModule,
    SharingModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Provider.name, schema: ProviderSchema },
      { name: AppointmentSlot.name, schema: AppointmentSlotSchema },
      { name: Appointment.name, schema: AppointmentSchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: ShareGrant.name, schema: ShareGrantSchema },
      { name: ShareOrganisation.name, schema: ShareOrganisationSchema },
      { name: AccessLog.name, schema: AccessLogSchema },
      { name: MedicalRecord.name, schema: MedicalRecordSchema },
    ]),
  ],
  controllers: [PartnerAuthController, PartnerController],
  providers: [
    PartnerContextService,
    PartnerAuthService,
    PartnerProfileService,
    PartnerAppointmentsService,
    PartnerRecordsService,
    PartnerPaymentsService,
  ],
})
export class PartnerModule {}
