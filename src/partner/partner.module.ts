import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import {
  AuditLog,
  AuditLogSchema,
} from '../audit-log/schemas/audit-log.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminProvidersModule } from '../admin/providers/admin-providers.module';
import { SharingModule } from '../core/sharing/sharing.module';
import { AiInteractionLogModule } from '../ai/ai-interaction-log/ai-interaction-log.module';
import { User, UserSchema } from '../core/users/schemas/user.schema';
import {
  Provider,
  ProviderSchema,
} from '../core/providers/schemas/provider.schema';
import {
  AppointmentSlot,
  AppointmentSlotSchema,
} from '../core/providers/schemas/appointment-slot.schema';
import {
  Appointment,
  AppointmentSchema,
} from '../core/appointments/schemas/appointment.schema';
import {
  Transaction,
  TransactionSchema,
} from '../core/payments/schemas/transaction.schema';
import {
  ShareGrant,
  ShareGrantSchema,
} from '../core/sharing/schemas/share-grant.schema';
import {
  ShareOrganisation,
  ShareOrganisationSchema,
} from '../core/sharing/schemas/share-organisation.schema';
import {
  AccessLog,
  AccessLogSchema,
} from '../core/sharing/schemas/access-log.schema';
import {
  MedicalRecord,
  MedicalRecordSchema,
} from '../core/records/schemas/medical-record.schema';
import { PartnerAuthController, PartnerController } from './partner.controller';
import {
  PartnerClinicalController,
  PartnerHospitalController,
  PartnerLabController,
  PartnerNotifyController,
  PartnerReferralsController,
  PartnerSecurityController,
  PartnerStaffController,
} from './partner-portal.controller';
import { PartnerContextService } from './partner-context.service';
import { PartnerAuthService } from './partner-auth.service';
import { PartnerProfileService } from './partner-profile.service';
import { PartnerAppointmentsService } from './partner-appointments.service';
import { PartnerRecordsService } from './partner-records.service';
import { PartnerPaymentsService } from './partner-payments.service';
import { PartnerPermGuard } from './rbac/partner-perm.guard';
import {
  PartnerMember,
  PartnerMemberSchema,
} from './staff/schemas/partner-member.schema';
import { PartnerStaffService } from './staff/partner-staff.service';
import { PartnerNotifyModule } from './notify/partner-notify.module';
import { PartnerSecurityService } from './security/partner-security.service';
import { PartnerDocumentsService } from './documents/partner-documents.service';
import {
  ConsultationNote,
  ConsultationNoteSchema,
} from './clinical/schemas/consultation-note.schema';
import {
  Prescription,
  PrescriptionSchema,
} from './clinical/schemas/prescription.schema';
import { PartnerPatientsService } from './clinical/partner-patients.service';
import { PartnerTimelineService } from './clinical/partner-timeline.service';
import { PartnerNotesService } from './clinical/partner-notes.service';
import { PartnerPrescriptionsService } from './clinical/partner-prescriptions.service';
import { Referral, ReferralSchema } from './referrals/schemas/referral.schema';
import { PartnerReferralsService } from './referrals/partner-referrals.service';
import {
  LabCatalogItem,
  LabCatalogItemSchema,
} from './lab/schemas/lab-catalog-item.schema';
import {
  LabInventoryItem,
  LabInventoryItemSchema,
} from './lab/schemas/lab-inventory-item.schema';
import {
  PartnerLabOrder,
  PartnerLabOrderSchema,
} from './lab/schemas/lab-order.schema';
import { LabResult, LabResultSchema } from './lab/schemas/lab-result.schema';
import { PartnerLabCatalogService } from './lab/partner-lab-catalog.service';
import { PartnerLabInventoryService } from './lab/partner-lab-inventory.service';
import { PartnerLabOrdersService } from './lab/partner-lab-orders.service';
import { PartnerLabResultsService } from './lab/partner-lab-results.service';
import { Ward, WardSchema } from './hospital/schemas/ward.schema';
import {
  PartnerAdmission,
  PartnerAdmissionSchema,
} from './hospital/schemas/admission.schema';
import {
  InsuranceClaim,
  InsuranceClaimSchema,
} from './hospital/schemas/insurance-claim.schema';
import { PartnerWardsService } from './hospital/partner-wards.service';
import { PartnerClaimsService } from './hospital/partner-claims.service';
import { PartnerAnalyticsService } from './hospital/partner-analytics.service';

/**
 * Partner Portal API (Product Journey §2, wireframes P01–P06) plus the
 * role-based portal for doctors, hospitals and diagnostic centres: staff &
 * RBAC, Security & Logs, Notification Center, clinical notes & E-Rx,
 * patient timeline, referrals, lab pipeline, wards, claims and analytics.
 */
@Module({
  imports: [
    AuthModule,
    AuditLogModule,
    NotificationsModule,
    AdminProvidersModule,
    SharingModule,
    AiInteractionLogModule,
    PartnerNotifyModule,
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
      { name: AuditLog.name, schema: AuditLogSchema },
      { name: PartnerMember.name, schema: PartnerMemberSchema },
      { name: ConsultationNote.name, schema: ConsultationNoteSchema },
      { name: Prescription.name, schema: PrescriptionSchema },
      { name: Referral.name, schema: ReferralSchema },
      { name: LabCatalogItem.name, schema: LabCatalogItemSchema },
      { name: LabInventoryItem.name, schema: LabInventoryItemSchema },
      { name: PartnerLabOrder.name, schema: PartnerLabOrderSchema },
      { name: LabResult.name, schema: LabResultSchema },
      { name: Ward.name, schema: WardSchema },
      { name: PartnerAdmission.name, schema: PartnerAdmissionSchema },
      { name: InsuranceClaim.name, schema: InsuranceClaimSchema },
    ]),
  ],
  controllers: [
    PartnerAuthController,
    PartnerController,
    PartnerStaffController,
    PartnerSecurityController,
    PartnerNotifyController,
    PartnerClinicalController,
    PartnerReferralsController,
    PartnerLabController,
    PartnerHospitalController,
  ],
  providers: [
    PartnerContextService,
    PartnerPermGuard,
    PartnerAuthService,
    PartnerProfileService,
    PartnerAppointmentsService,
    PartnerRecordsService,
    PartnerPaymentsService,
    PartnerStaffService,
    PartnerSecurityService,
    PartnerDocumentsService,
    PartnerPatientsService,
    PartnerTimelineService,
    PartnerNotesService,
    PartnerPrescriptionsService,
    PartnerReferralsService,
    PartnerLabCatalogService,
    PartnerLabInventoryService,
    PartnerLabOrdersService,
    PartnerLabResultsService,
    PartnerWardsService,
    PartnerClaimsService,
    PartnerAnalyticsService,
  ],
})
export class PartnerModule {}
