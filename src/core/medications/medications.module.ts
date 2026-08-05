import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Medication, MedicationSchema } from './schemas/medication.schema';
import {
  MedicationLog,
  MedicationLogSchema,
} from './schemas/medication-log.schema';
import { MedicationsController } from './medications.controller';
import { MedicationsService } from './medications.service';
import { AuthModule } from '../../auth/auth.module';
import { NotificationsModule } from '../../notifications/notifications.module';

@Module({
  imports: [
    AuthModule,
    NotificationsModule,
    MongooseModule.forFeature([
      { name: Medication.name, schema: MedicationSchema },
      { name: MedicationLog.name, schema: MedicationLogSchema },
    ]),
  ],
  controllers: [MedicationsController],
  providers: [MedicationsService],
  exports: [MongooseModule, MedicationsService],
})
export class MedicationsModule {}
