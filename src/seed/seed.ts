import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../app.module';

import {
  CURRENT_CONSENT_VERSION,
  User,
  UserRole,
  UserStatus,
} from '../core/users/schemas/user.schema';
import { HealthProfile } from '../core/health-profile/schemas/health-profile.schema';
import { EmergencyContact } from '../core/health-profile/schemas/emergency-contact.schema';
import { Medication } from '../core/medications/schemas/medication.schema';
import {
  MedicationLog,
  MedicationLogStatus,
} from '../core/medications/schemas/medication-log.schema';
import {
  Provider,
  ProviderCategory,
  ProviderStatus,
} from '../core/providers/schemas/provider.schema';
import {
  AppointmentSlot,
  AppointmentSlotStatus,
} from '../core/providers/schemas/appointment-slot.schema';
import {
  Appointment,
  AppointmentStatus,
} from '../core/appointments/schemas/appointment.schema';
import {
  MedicalRecord,
  MedicalRecordType,
} from '../core/records/schemas/medical-record.schema';
import {
  FeedbackItem,
  FeedbackStatus,
  FeedbackType,
} from '../core/feedback/schemas/feedback-item.schema';
import {
  AIInteractionLog,
  AiService,
} from '../ai/ai-interaction-log/schemas/ai-interaction-log.schema';
import { SymptomEntry } from '../ai/symptom-nav/schemas/symptom-entry.schema';
import {
  TriageResult,
  Urgency,
  RiskLevel,
  RecommendedCareLevel,
} from '../ai/symptom-nav/schemas/triage-result.schema';
import {
  CareJourney,
  CareJourneyStatus,
  CareStepStatus,
} from '../ai/care-journey/schemas/care-journey.schema';
import {
  ReportInterpretation,
  ReportAiStatus,
  HighlightedValueStatus,
} from '../ai/report-interpreter/schemas/report-interpretation.schema';

// Mirrors ayuva-mobile/services/mockData.ts + ayuva-admin's mock rows, so
// patient/provider names and IDs stay consistent across all three surfaces.

const RULES_VERSION = 'v1.0.0';
const DEFAULT_PASSWORD = 'Password123!';
const SEED_CONSENT = {
  termsAccepted: true,
  privacyAccepted: true,
  healthDataProcessingAccepted: true,
  version: CURRENT_CONSENT_VERSION,
  acceptedAt: new Date('2026-01-15'),
};

const patientSeed = {
  name: 'Amara',
  fullName: 'Amara Okafor',
  email: 'amara.o@example.com',
  age: 42,
  gender: 'Female',
  conditions: ['Hypertension', 'Mild Asthma'],
  allergies: ['Penicillin', 'Peanuts'],
  emergencyContact: { name: 'Chidi Okafor', phone: '+44 7700 900123' },
};

const otherPatients = [
  { name: 'Marcus Bell', email: 'marcus.b@example.com', age: 58 },
  { name: 'Lena Sørensen', email: 'lena.s@example.com', age: 34 },
  { name: 'Isabela Costa', email: 'isabela.c@example.com', age: 29 },
  { name: 'Kwame Adjei', email: 'kwame.a@example.com', age: 61 },
  { name: 'Yuki Tanaka', email: 'yuki.t@example.com', age: 47 },
  { name: 'Sara Lund', email: 'sara.l@example.com', age: 39 },
];

const medicationsSeed = [
  {
    name: 'Amlodipine',
    dosage: '5 mg',
    frequency: 'Once daily · morning',
    scheduleTimes: ['08:00'],
    taken: true,
    refillThresholdDays: 3,
  },
  {
    name: 'Salbutamol Inhaler',
    dosage: '2 puffs',
    frequency: 'As needed',
    scheduleTimes: [],
    taken: false,
    refillThresholdDays: 7,
    suppliesRemainingDays: 5,
  },
  {
    name: 'Atorvastatin',
    dosage: '20 mg',
    frequency: 'Once daily · night',
    scheduleTimes: ['21:30'],
    taken: false,
    refillThresholdDays: 3,
  },
];

const providersSeed = [
  {
    key: 'p1',
    name: 'Dr. Priya Menon',
    type: ProviderCategory.SPECIALIST,
    specialty: ['Cardiologist', 'Heart & Vascular'],
    rating: 4.9,
    avgWaitMinutes: 2 * 24 * 60,
    languages: ['EN', 'HI', 'TA'],
    locations: [
      { label: 'Meadow Health Centre', address: '221B Meadow Lane, London' },
    ],
  },
  {
    key: 'p2',
    name: 'Dr. James Whitaker',
    type: ProviderCategory.GP,
    specialty: ['General Practitioner'],
    rating: 4.7,
    avgWaitMinutes: 0,
    languages: ['EN', 'FR'],
    locations: [
      { label: 'Willow GP Practice', address: '4 Willow Street, London' },
    ],
  },
  {
    key: 'p3',
    name: 'Meadow Diagnostics',
    type: ProviderCategory.DIAGNOSTIC,
    specialty: ['Imaging & lab tests'],
    rating: 4.6,
    avgWaitMinutes: 24 * 60,
    languages: ['EN'],
    locations: [
      { label: 'Meadow Diagnostics', address: '10 Meadow Lane, London' },
    ],
  },
  {
    key: 'p4',
    name: 'Riverside Physio',
    type: ProviderCategory.PHYSIO,
    specialty: ['Physiotherapy'],
    rating: 4.8,
    avgWaitMinutes: 3 * 24 * 60,
    languages: ['EN', 'ES'],
    locations: [
      { label: 'Riverside Physio', address: '7 Riverside Walk, London' },
    ],
  },
];

const appointmentsSeed = [
  {
    providerKey: 'p1',
    date: '2026-08-14',
    time: '10:30',
    status: AppointmentStatus.CONFIRMED,
  },
  {
    providerKey: 'p2',
    date: '2026-07-08',
    time: '09:00',
    status: AppointmentStatus.COMPLETED,
  },
  {
    providerKey: 'p3',
    date: '2026-07-24',
    time: '14:00',
    status: AppointmentStatus.COMPLETED,
  },
];

const reportsSeed = [
  {
    key: 'r1',
    type: MedicalRecordType.BLOOD,
    fileRef: 'records/amara-okafor/lipid-panel-2026-08-02.pdf',
    uploadedAt: new Date('2026-08-02'),
    summaryText:
      'Your good cholesterol (HDL) is healthy. LDL is a touch high — your doctor may consider adjusting your statin dose.',
    findings: [
      {
        label: 'Total cholesterol',
        value: '5.4 mmol/L',
        status: HighlightedValueStatus.HIGH,
      },
      {
        label: 'HDL',
        value: '1.5 mmol/L',
        status: HighlightedValueStatus.NORMAL,
      },
      {
        label: 'LDL',
        value: '3.6 mmol/L',
        status: HighlightedValueStatus.HIGH,
      },
      {
        label: 'Triglycerides',
        value: '1.1 mmol/L',
        status: HighlightedValueStatus.NORMAL,
      },
    ],
    questions: [
      'Should my atorvastatin dose be adjusted?',
      'How often should I re-test my lipid panel?',
      'Any dietary changes you recommend for LDL?',
    ],
    aiStatus: ReportAiStatus.INTERPRETED,
  },
  {
    key: 'r2',
    type: MedicalRecordType.IMAGING,
    fileRef: 'records/amara-okafor/resting-ecg-2026-07-28.pdf',
    uploadedAt: new Date('2026-07-28'),
    summaryText:
      'A minor rhythm variation was noted. Dr. Menon will review this at your visit — it is not an urgent finding.',
    findings: [
      {
        label: 'Heart rate',
        value: '78 bpm',
        status: HighlightedValueStatus.NORMAL,
      },
      {
        label: 'PR interval',
        value: '210 ms',
        status: HighlightedValueStatus.HIGH,
      },
      {
        label: 'QT interval',
        value: '400 ms',
        status: HighlightedValueStatus.NORMAL,
      },
    ],
    questions: [
      'Does the PR interval finding change my treatment?',
      'Do I need a Holter monitor for further tracking?',
    ],
    aiStatus: ReportAiStatus.PROCESSING,
  },
  {
    key: 'r3',
    type: MedicalRecordType.BLOOD,
    fileRef: 'records/amara-okafor/bp-log-2026-07-25.pdf',
    uploadedAt: new Date('2026-07-25'),
    summaryText:
      'Average readings are within target, but the last week trended higher. Morning logs will help your cardiologist tune your meds.',
    findings: [
      {
        label: 'Avg systolic',
        value: '134 mmHg',
        status: HighlightedValueStatus.HIGH,
      },
      {
        label: 'Avg diastolic',
        value: '84 mmHg',
        status: HighlightedValueStatus.HIGH,
      },
    ],
    questions: [
      'Is the trend enough to change my Amlodipine dose?',
      'Should I log twice per day?',
    ],
    aiStatus: ReportAiStatus.INTERPRETED,
  },
];

const careStepsSeed = [
  {
    name: 'Symptoms reported',
    status: CareStepStatus.DONE,
    contextNote: 'You told us about your chest pain and shortness of breath.',
  },
  {
    name: 'Guidance received',
    status: CareStepStatus.DONE,
    contextNote: 'Care level set to Specialist visit within 1 week.',
  },
  {
    name: 'Cardiologist visit',
    status: CareStepStatus.CURRENT,
    contextNote: 'Dr. Priya Menon on Thu 14 Aug at 10:30 AM.',
  },
  {
    name: 'ECG & blood work',
    status: CareStepStatus.UPCOMING,
    contextNote: 'Recommended if cardiologist requests further tests.',
  },
  {
    name: 'Follow-up review',
    status: CareStepStatus.UPCOMING,
    contextNote: 'Discuss results and adjust care plan.',
  },
  {
    name: 'Ongoing monitoring',
    status: CareStepStatus.UPCOMING,
    contextNote: 'Daily BP logging and medication adherence.',
  },
];

const feedbackSeed = [
  {
    patientName: 'Amara Okafor',
    type: FeedbackType.BUG,
    title: 'Sync issue',
    description: "BP log didn't sync after re-opening the app.",
    status: FeedbackStatus.IN_REVIEW,
  },
  {
    patientName: 'Marcus Bell',
    type: FeedbackType.FEATURE_REQUEST,
    title: 'Insulin reminders',
    description: 'Please add insulin dose reminders.',
    status: FeedbackStatus.OPEN,
  },
  {
    patientName: 'Lena Sørensen',
    type: FeedbackType.FEEDBACK,
    title: 'Great care journey',
    description: 'The care journey helped me prepare for my visit.',
    status: FeedbackStatus.CLOSED,
  },
  {
    patientName: 'Kwame Adjei',
    type: FeedbackType.BUG,
    title: 'AI misread ECG',
    description: 'AI mis-read my ECG range values.',
    status: FeedbackStatus.OPEN,
  },
];

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const userModel = app.get<Model<User>>(getModelToken(User.name));
  const healthProfileModel = app.get<Model<HealthProfile>>(
    getModelToken(HealthProfile.name),
  );
  const emergencyContactModel = app.get<Model<EmergencyContact>>(
    getModelToken(EmergencyContact.name),
  );
  const medicationModel = app.get<Model<Medication>>(
    getModelToken(Medication.name),
  );
  const medicationLogModel = app.get<Model<MedicationLog>>(
    getModelToken(MedicationLog.name),
  );
  const providerModel = app.get<Model<Provider>>(getModelToken(Provider.name));
  const appointmentSlotModel = app.get<Model<AppointmentSlot>>(
    getModelToken(AppointmentSlot.name),
  );
  const appointmentModel = app.get<Model<Appointment>>(
    getModelToken(Appointment.name),
  );
  const medicalRecordModel = app.get<Model<MedicalRecord>>(
    getModelToken(MedicalRecord.name),
  );
  const reportInterpretationModel = app.get<Model<ReportInterpretation>>(
    getModelToken(ReportInterpretation.name),
  );
  const symptomEntryModel = app.get<Model<SymptomEntry>>(
    getModelToken(SymptomEntry.name),
  );
  const triageResultModel = app.get<Model<TriageResult>>(
    getModelToken(TriageResult.name),
  );
  const careJourneyModel = app.get<Model<CareJourney>>(
    getModelToken(CareJourney.name),
  );
  const aiInteractionLogModel = app.get<Model<AIInteractionLog>>(
    getModelToken(AIInteractionLog.name),
  );
  const feedbackItemModel = app.get<Model<FeedbackItem>>(
    getModelToken(FeedbackItem.name),
  );

  console.log('Clearing existing seed data...');
  const allModels: Model<any>[] = [
    userModel,
    healthProfileModel,
    emergencyContactModel,
    medicationModel,
    medicationLogModel,
    providerModel,
    appointmentSlotModel,
    appointmentModel,
    medicalRecordModel,
    reportInterpretationModel,
    symptomEntryModel,
    triageResultModel,
    careJourneyModel,
    aiInteractionLogModel,
    feedbackItemModel,
  ];
  await Promise.all(allModels.map((model) => model.deleteMany({})));

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  console.log('Seeding users...');
  const amara = await userModel.create({
    fullName: patientSeed.fullName,
    email: patientSeed.email,
    passwordHash,
    role: UserRole.PATIENT,
    status: UserStatus.ACTIVE,
    consent: SEED_CONSENT,
  });

  const userByName = new Map<string, Types.ObjectId>([
    [patientSeed.fullName, amara._id],
  ]);
  for (const p of otherPatients) {
    const doc = await userModel.create({
      fullName: p.name,
      email: p.email,
      passwordHash,
      role: UserRole.PATIENT,
      status: UserStatus.ACTIVE,
      consent: SEED_CONSENT,
    });
    userByName.set(p.name, doc._id);
  }

  await userModel.create({
    fullName: 'Ayuva Admin',
    email: 'admin@ayuva.health',
    passwordHash,
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    consent: SEED_CONSENT,
  });

  console.log("Seeding Amara's health profile...");
  await healthProfileModel.create({
    userId: amara._id,
    age: patientSeed.age,
    gender: patientSeed.gender,
    conditions: patientSeed.conditions,
    allergies: patientSeed.allergies,
  });
  await emergencyContactModel.create({
    userId: amara._id,
    name: patientSeed.emergencyContact.name,
    phone: patientSeed.emergencyContact.phone,
  });

  console.log('Seeding medications...');
  for (const m of medicationsSeed) {
    const medication = await medicationModel.create({
      userId: amara._id,
      name: m.name,
      dosage: m.dosage,
      frequency: m.frequency,
      scheduleTimes: m.scheduleTimes,
      refillThresholdDays: m.refillThresholdDays,
      suppliesRemainingDays: m.suppliesRemainingDays,
      active: true,
    });
    await medicationLogModel.create({
      medicationId: medication._id,
      scheduledAt: new Date(),
      status: m.taken
        ? MedicationLogStatus.TAKEN
        : MedicationLogStatus.UPCOMING,
      actionedAt: m.taken ? new Date() : undefined,
    });
  }

  console.log('Seeding providers...');
  const providerByKey = new Map<string, Types.ObjectId>();
  for (const p of providersSeed) {
    const doc = await providerModel.create({
      name: p.name,
      type: p.type,
      specialty: p.specialty,
      locations: p.locations,
      languages: p.languages,
      rating: p.rating,
      avgWaitMinutes: p.avgWaitMinutes,
      status: ProviderStatus.ACTIVE,
    });
    providerByKey.set(p.key, doc._id);
  }

  console.log('Seeding appointment slots + appointments...');
  for (const a of appointmentsSeed) {
    const providerId = providerByKey.get(a.providerKey)!;
    const slot = await appointmentSlotModel.create({
      providerId,
      date: new Date(a.date),
      time: a.time,
      durationMin: 30,
      status: AppointmentSlotStatus.BOOKED,
    });
    await appointmentModel.create({
      patientId: amara._id,
      providerId,
      slotId: slot._id,
      status: a.status,
    });
  }

  // A handful of open slots so Provider Discovery -> booking has something to select (FR-7.1/7.2).
  for (const [, providerId] of providerByKey) {
    for (const time of ['09:00', '11:30', '15:00']) {
      await appointmentSlotModel.create({
        providerId,
        date: new Date('2026-08-20'),
        time,
        durationMin: 30,
        status: AppointmentSlotStatus.OPEN,
      });
    }
  }

  console.log('Seeding medical records + report interpretations...');
  for (const r of reportsSeed) {
    const record = await medicalRecordModel.create({
      patientId: amara._id,
      fileRef: r.fileRef,
      originalFileName: r.fileRef.split('/').pop(),
      type: r.type,
      uploadedAt: r.uploadedAt,
    });
    await reportInterpretationModel.create({
      recordId: record._id,
      summaryText: r.summaryText,
      highlightedValues: r.findings,
      suggestedQuestions: r.questions,
      aiStatus: r.aiStatus,
    });
  }

  console.log('Seeding symptom navigation + care journey...');
  const symptomEntry = await symptomEntryModel.create({
    userId: amara._id,
    rawText:
      'Sharp chest tightness that comes and goes, worse on stairs, with occasional dizziness.',
    durationDays: 3,
    extractedSymptoms: [
      'Chest tightness',
      'Shortness of breath on exertion',
      'Occasional dizziness',
    ],
  });
  const triageResult = await triageResultModel.create({
    symptomEntryId: symptomEntry._id,
    understoodSymptoms: [
      'Chest tightness',
      'Shortness of breath on exertion',
      'Occasional dizziness',
    ],
    urgency: Urgency.PRIORITY,
    riskLevel: RiskLevel.MODERATE_HIGH,
    recommendedCareLevel: RecommendedCareLevel.SPECIALIST,
    rulesVersion: RULES_VERSION,
  });
  await careJourneyModel.create({
    userId: amara._id,
    triageResultId: triageResult._id,
    title: 'Chest pain review',
    steps: careStepsSeed,
    progressPct: 48,
    status: CareJourneyStatus.ACTIVE,
  });

  console.log('Seeding AI interaction log...');
  await aiInteractionLogModel.create({
    userId: amara._id,
    service: AiService.SYMPTOM_NAV,
    input: {
      rawText: symptomEntry.rawText,
      durationDays: symptomEntry.durationDays,
    },
    outcome: {
      urgency: triageResult.urgency,
      riskLevel: triageResult.riskLevel,
      recommendedCareLevel: triageResult.recommendedCareLevel,
    },
    latencyMs: 1240,
    // Auto-flagged: riskLevel is Moderate-High (TRD §5.4 escalation rule).
    flagged: true,
    reviewStatus: 'none',
  });
  const kwameId = userByName.get('Kwame Adjei');
  if (kwameId) {
    await aiInteractionLogModel.create({
      userId: kwameId,
      service: AiService.SYMPTOM_NAV,
      input: {
        rawText: 'Sudden severe chest pain radiating to left arm',
        durationDays: 0,
      },
      outcome: {
        urgency: Urgency.EMERGENCY,
        riskLevel: RiskLevel.HIGH,
        recommendedCareLevel: RecommendedCareLevel.EMERGENCY_ROOM,
      },
      latencyMs: 980,
      flagged: true,
      reviewStatus: 'assigned',
    });
  }

  console.log('Seeding feedback items...');
  for (const f of feedbackSeed) {
    const reporterId = userByName.get(f.patientName);
    if (!reporterId) continue;
    await feedbackItemModel.create({
      reporterId,
      type: f.type,
      title: f.title,
      description: f.description,
      status: f.status,
    });
  }

  console.log('Seed complete.');
  await app.close();
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
