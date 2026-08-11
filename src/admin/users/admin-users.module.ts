import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../../core/users/schemas/user.schema';
import {
  HealthProfile,
  HealthProfileSchema,
} from '../../core/health-profile/schemas/health-profile.schema';
import {
  Appointment,
  AppointmentSchema,
} from '../../core/appointments/schemas/appointment.schema';
import {
  AppointmentSlot,
  AppointmentSlotSchema,
} from '../../core/providers/schemas/appointment-slot.schema';
import {
  Provider,
  ProviderSchema,
} from '../../core/providers/schemas/provider.schema';
import {
  Medication,
  MedicationSchema,
} from '../../core/medications/schemas/medication.schema';
import {
  MedicationLog,
  MedicationLogSchema,
} from '../../core/medications/schemas/medication-log.schema';
import {
  MedicalRecord,
  MedicalRecordSchema,
} from '../../core/records/schemas/medical-record.schema';
import { AuthModule } from '../../auth/auth.module';
import { AuditLogModule } from '../../audit-log/audit-log.module';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

@Module({
  imports: [
    AuthModule,
    AuditLogModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: HealthProfile.name, schema: HealthProfileSchema },
      { name: Appointment.name, schema: AppointmentSchema },
      { name: AppointmentSlot.name, schema: AppointmentSlotSchema },
      { name: Provider.name, schema: ProviderSchema },
      { name: Medication.name, schema: MedicationSchema },
      { name: MedicationLog.name, schema: MedicationLogSchema },
      { name: MedicalRecord.name, schema: MedicalRecordSchema },
    ]),
  ],
  controllers: [AdminUsersController],
  providers: [AdminUsersService],
})
export class AdminUsersModule {}
