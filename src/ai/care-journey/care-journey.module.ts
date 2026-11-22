import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CareJourney, CareJourneySchema } from './schemas/care-journey.schema';
import {
  TriageResult,
  TriageResultSchema,
} from '../symptom-nav/schemas/triage-result.schema';
import {
  SymptomEntry,
  SymptomEntrySchema,
} from '../symptom-nav/schemas/symptom-entry.schema';
import { NavIntent, NavIntentSchema } from '../nav-intent/schemas/nav-intent.schema';
import {
  Appointment,
  AppointmentSchema,
} from '../../core/appointments/schemas/appointment.schema';
import {
  AppointmentSlot,
  AppointmentSlotSchema,
} from '../../core/providers/schemas/appointment-slot.schema';
import { Provider, ProviderSchema } from '../../core/providers/schemas/provider.schema';
import {
  Prescription,
  PrescriptionSchema,
} from '../../partner/clinical/schemas/prescription.schema';
import {
  MedicalRecord,
  MedicalRecordSchema,
} from '../../core/records/schemas/medical-record.schema';
import { Dispense, DispenseSchema } from '../../partner/hospital/schemas/dispense.schema';
import {
  PartnerLabOrder,
  PartnerLabOrderSchema,
} from '../../partner/lab/schemas/lab-order.schema';
import { CareJourneyController } from './care-journey.controller';
import { CareJourneyService } from './care-journey.service';
import { AuthModule } from '../../auth/auth.module';
import { AiInteractionLogModule } from '../ai-interaction-log/ai-interaction-log.module';

/**
 * Care Journey endpoints (TRD §4.2, §5.2) — MOCK pathway generation
 * (docs/AI_INTEGRATION_CONTRACT.md); step-progress updates are real state.
 */
@Module({
  imports: [
    AuthModule,
    AiInteractionLogModule,
    MongooseModule.forFeature([
      { name: CareJourney.name, schema: CareJourneySchema },
      { name: TriageResult.name, schema: TriageResultSchema },
      { name: SymptomEntry.name, schema: SymptomEntrySchema },
      { name: NavIntent.name, schema: NavIntentSchema },
      { name: Appointment.name, schema: AppointmentSchema },
      { name: AppointmentSlot.name, schema: AppointmentSlotSchema },
      { name: Provider.name, schema: ProviderSchema },
      { name: Prescription.name, schema: PrescriptionSchema },
      { name: MedicalRecord.name, schema: MedicalRecordSchema },
      { name: Dispense.name, schema: DispenseSchema },
      { name: PartnerLabOrder.name, schema: PartnerLabOrderSchema },
    ]),
  ],
  controllers: [CareJourneyController],
  providers: [CareJourneyService],
  exports: [MongooseModule],
})
export class CareJourneyModule {}
