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
import { PartnerLetterheadService } from './documents/partner-letterhead.service';
import { PartnerLetterheadController } from './documents/partner-letterhead.controller';
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
import {
  PartnerBillPayment,
  PartnerBillPaymentSchema,
} from './hospital/schemas/bill-payment.schema';
import { PartnerWardsService } from './hospital/partner-wards.service';
import { PartnerClaimsService } from './hospital/partner-claims.service';
import { PartnerAnalyticsService } from './hospital/partner-analytics.service';
import { PartnerBillPaymentsService } from './hospital/partner-bill-payments.service';
import { PartnerCapacityService } from './hospital/partner-capacity.service';
import {
  StockItem,
  StockItemSchema,
} from './hospital/schemas/stock-item.schema';
import {
  StockMove,
  StockMoveSchema,
} from './hospital/schemas/stock-move.schema';
import { Dispense, DispenseSchema } from './hospital/schemas/dispense.schema';
import { PartnerStockService } from './hospital/partner-stock.service';
import { PartnerPharmacyService } from './hospital/partner-pharmacy.service';
import {
  PartnerPharmacyController,
  PartnerSupplyController,
} from './hospital/partner-stores.controller';
import {
  PartnerAsset,
  PartnerAssetSchema,
} from './hospital/schemas/asset.schema';
import { PartnerAssetsService } from './hospital/partner-assets.service';
import { ErVisit, ErVisitSchema } from './hospital/schemas/er-visit.schema';
import { PartnerErService } from './hospital/partner-er.service';
import { PartnerErController } from './hospital/partner-er.controller';
import {
  OtCase,
  OtCaseSchema,
  OtRoom,
  OtRoomSchema,
} from './hospital/schemas/ot.schema';
import { PartnerOtService } from './hospital/partner-ot.service';
import { PartnerOtController } from './hospital/partner-ot.controller';
import {
  LisSample,
  LisSampleSchema,
} from './hospital/schemas/lis-sample.schema';
import { PartnerLisService } from './hospital/partner-lis.service';
import { PartnerLisController } from './hospital/partner-lis.controller';
import {
  PatientAllergy,
  PatientAllergySchema,
} from './clinical/schemas/patient-allergy.schema';
import {
  CaseMessage,
  CaseMessageSchema,
} from './clinical/schemas/case-message.schema';
import { PartnerDiscussionService } from './clinical/partner-discussion.service';
import { PartnerLabCriticalService } from './lab/partner-lab-critical.service';
import {
  ColdChainRun,
  ColdChainRunSchema,
} from './lab/schemas/cold-chain-run.schema';
import { PartnerColdChainService } from './lab/partner-cold-chain.service';
import { PartnerColdChainController } from './lab/partner-cold-chain.controller';
import {
  QcMaterial,
  QcMaterialSchema,
  QcRun,
  QcRunSchema,
} from './lab/schemas/qc.schema';
import { PartnerQcService } from './lab/partner-qc.service';
import { PartnerQcController } from './lab/partner-qc.controller';
import { PartnerLabRoutesService } from './lab/partner-lab-routes.service';
import { PartnerLabRoutesController } from './lab/partner-lab-routes.controller';
import {
  AnalyserMessage,
  AnalyserMessageSchema,
  LabAnalyser,
  LabAnalyserSchema,
} from './lab/schemas/analyser.schema';
import { PartnerAnalysersService } from './lab/partner-analysers.service';
import {
  FhirConnection,
  FhirConnectionSchema,
} from './lab/fhir/fhir-connection.schema';
import { PartnerFhirService } from './lab/fhir/partner-fhir.service';
import { PartnerFhirController } from './lab/fhir/partner-fhir.controller';
import { PartnerStowService } from './lab/stow/partner-stow.service';
import { StowController } from './lab/stow/stow.controller';
import { TrendLink, TrendLinkSchema } from './lab/schemas/trend-link.schema';
import { PartnerTrendLinksService } from './lab/partner-trend-links.service';
import { PublicTrendsController } from './lab/public-trends.controller';
import {
  LisIngestController,
  PartnerAnalysersController,
} from './lab/partner-analysers.controller';
import { PartnerDiscussionController } from './clinical/partner-discussion.controller';
import {
  HealthProfile,
  HealthProfileSchema,
} from '../core/health-profile/schemas/health-profile.schema';
import {
  Medication,
  MedicationSchema,
} from '../core/medications/schemas/medication.schema';
import { PartnerLabValuesService } from './clinical/partner-lab-values.service';
import { PartnerSafetyService } from './clinical/partner-safety.service';
import { PartnerBriefService } from './clinical/partner-brief.service';
import { PartnerSafetyController } from './clinical/partner-safety.controller';
import { PartnerDicomwebService } from './lab/dicomweb/partner-dicomweb.service';
import { PartnerDicomwebController } from './lab/dicomweb/partner-dicomweb.controller';
import {
  PartnerMonitor,
  PartnerMonitorSchema,
  PartnerVital,
  PartnerVitalSchema,
} from './hospital/schemas/telemetry.schema';
import { PartnerTelemetryService } from './hospital/partner-telemetry.service';
import { PartnerTelemetryController } from './hospital/partner-telemetry.controller';
import { TelemetryIngestGateway } from './hospital/telemetry-ingest.gateway';
import { WsUpgradeRouter } from './live/ws-upgrade-router.service';
import { PartnerLiveGateway } from './live/partner-live.gateway';

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
      { name: PartnerBillPayment.name, schema: PartnerBillPaymentSchema },
      { name: StockItem.name, schema: StockItemSchema },
      { name: StockMove.name, schema: StockMoveSchema },
      { name: Dispense.name, schema: DispenseSchema },
      { name: PartnerAsset.name, schema: PartnerAssetSchema },
      { name: ErVisit.name, schema: ErVisitSchema },
      { name: OtRoom.name, schema: OtRoomSchema },
      { name: OtCase.name, schema: OtCaseSchema },
      { name: LisSample.name, schema: LisSampleSchema },
      { name: PatientAllergy.name, schema: PatientAllergySchema },
      { name: CaseMessage.name, schema: CaseMessageSchema },
      { name: ColdChainRun.name, schema: ColdChainRunSchema },
      { name: QcMaterial.name, schema: QcMaterialSchema },
      { name: QcRun.name, schema: QcRunSchema },
      { name: LabAnalyser.name, schema: LabAnalyserSchema },
      { name: FhirConnection.name, schema: FhirConnectionSchema },
      { name: AnalyserMessage.name, schema: AnalyserMessageSchema },
      { name: TrendLink.name, schema: TrendLinkSchema },
      { name: HealthProfile.name, schema: HealthProfileSchema },
      { name: Medication.name, schema: MedicationSchema },
      { name: PartnerMonitor.name, schema: PartnerMonitorSchema },
      { name: PartnerVital.name, schema: PartnerVitalSchema },
    ]),
  ],
  controllers: [
    PartnerAuthController,
    PartnerController,
    PartnerStaffController,
    PartnerSecurityController,
    PartnerNotifyController,
    PartnerLetterheadController,
    PartnerClinicalController,
    PartnerReferralsController,
    PartnerLabController,
    PartnerHospitalController,
    PartnerPharmacyController,
    PartnerSupplyController,
    PartnerErController,
    PartnerOtController,
    PartnerLisController,
    PartnerSafetyController,
    PartnerDiscussionController,
    PartnerColdChainController,
    PartnerQcController,
    PartnerLabRoutesController,
    PartnerAnalysersController,
    PartnerFhirController,
    LisIngestController,
    StowController,
    PublicTrendsController,
    PartnerDicomwebController,
    PartnerTelemetryController,
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
    PartnerLetterheadService,
    PartnerPatientsService,
    PartnerTimelineService,
    PartnerNotesService,
    PartnerPrescriptionsService,
    PartnerReferralsService,
    PartnerLabCatalogService,
    PartnerLabInventoryService,
    PartnerLabOrdersService,
    PartnerLabResultsService,
    PartnerLabCriticalService,
    PartnerColdChainService,
    PartnerQcService,
    PartnerLabRoutesService,
    PartnerAnalysersService,
    PartnerFhirService,
    PartnerStowService,
    PartnerTrendLinksService,
    PartnerWardsService,
    PartnerClaimsService,
    PartnerAnalyticsService,
    PartnerBillPaymentsService,
    PartnerCapacityService,
    PartnerStockService,
    PartnerPharmacyService,
    PartnerAssetsService,
    PartnerErService,
    PartnerOtService,
    PartnerLisService,
    PartnerLabValuesService,
    PartnerSafetyService,
    PartnerBriefService,
    PartnerDiscussionService,
    WsUpgradeRouter,
    PartnerLiveGateway,
    PartnerDicomwebService,
    PartnerTelemetryService,
    TelemetryIngestGateway,
  ],
})
export class PartnerModule {}
