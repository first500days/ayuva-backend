import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ShareGrant, ShareGrantSchema } from './schemas/share-grant.schema';
import { ShareOrganisation, ShareOrganisationSchema } from './schemas/share-organisation.schema';
import { AccessLog, AccessLogSchema } from './schemas/access-log.schema';
import {
  MedicalRecord,
  MedicalRecordSchema,
} from '../records/schemas/medical-record.schema';
import {
  Appointment,
  AppointmentSchema,
} from '../appointments/schemas/appointment.schema';
import {
  AppointmentSlot,
  AppointmentSlotSchema,
} from '../providers/schemas/appointment-slot.schema';
import { SharingController } from './sharing.controller';
import { SharingService } from './sharing.service';
import { AuthModule } from '../../auth/auth.module';
import { AuditLogModule } from '../../audit-log/audit-log.module';
import { NotificationsModule } from '../../notifications/notifications.module';

@Module({
  imports: [
    AuthModule,
    AuditLogModule,
    NotificationsModule,
    MongooseModule.forFeature([
      { name: ShareGrant.name, schema: ShareGrantSchema },
      { name: ShareOrganisation.name, schema: ShareOrganisationSchema },
      { name: AccessLog.name, schema: AccessLogSchema },
      { name: MedicalRecord.name, schema: MedicalRecordSchema },
      { name: Appointment.name, schema: AppointmentSchema },
      { name: AppointmentSlot.name, schema: AppointmentSlotSchema },
    ]),
  ],
  controllers: [SharingController],
  providers: [SharingService],
  // SharingService: appointments and the partner portal revoke "this visit"
  // grants when a visit is cancelled or rejected.
  exports: [SharingService],
})
export class SharingModule {}
