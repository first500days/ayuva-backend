import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  GlossaryTerm,
  HighlightedValue,
  HighlightedValueStatus,
  ReportAiStatus,
  ReportInterpretation,
  ReportInterpretationDocument,
} from './schemas/report-interpretation.schema';
import {
  MedicalRecord,
  MedicalRecordDocument,
  MedicalRecordType,
} from '../../core/records/schemas/medical-record.schema';
import { AnalyseReportDto } from './dto/analyse-report.dto';
import { ReportInterpretationResponseDto } from './dto/report-interpretation-response.dto';
import { AiInteractionLogService } from '../ai-interaction-log/ai-interaction-log.service';
import { AiService } from '../ai-interaction-log/schemas/ai-interaction-log.schema';
import { AiSource } from '../common/ai-source.enum';
import { AI_DISCLAIMER } from '../common/ai-disclaimer.constant';

interface MockTemplate {
  summaryText: string;
  highlightedValues: Array<{ label: string; valueOptions: string[]; statusOptions: HighlightedValueStatus[] }>;
  glossaryTerms: GlossaryTerm[];
  suggestedQuestions: string[];
}

// Deterministic, type-appropriate placeholder content standing in for the
// real Report Interpreter's model output (TRD §5.3) — never a diagnosis.
const TEMPLATES: Record<MedicalRecordType, MockTemplate> = {
  [MedicalRecordType.BLOOD]: {
    summaryText:
      'This blood panel checks how key body systems are functioning. Most values fall within the typical reference range; anything flagged below is worth discussing with your provider — it is not a diagnosis.',
    highlightedValues: [
      { label: 'Hemoglobin', valueOptions: ['13.8 g/dL', '11.2 g/dL', '14.5 g/dL'], statusOptions: [HighlightedValueStatus.NORMAL, HighlightedValueStatus.LOW, HighlightedValueStatus.NORMAL] },
      { label: 'White Blood Cell Count', valueOptions: ['6.5 x10^9/L', '11.8 x10^9/L', '7.1 x10^9/L'], statusOptions: [HighlightedValueStatus.NORMAL, HighlightedValueStatus.HIGH, HighlightedValueStatus.NORMAL] },
      { label: 'LDL Cholesterol', valueOptions: ['98 mg/dL', '165 mg/dL', '110 mg/dL'], statusOptions: [HighlightedValueStatus.NORMAL, HighlightedValueStatus.HIGH, HighlightedValueStatus.NORMAL] },
      { label: 'Fasting Glucose', valueOptions: ['88 mg/dL', '104 mg/dL', '92 mg/dL'], statusOptions: [HighlightedValueStatus.NORMAL, HighlightedValueStatus.HIGH, HighlightedValueStatus.NORMAL] },
    ],
    glossaryTerms: [
      { term: 'Hemoglobin', definition: 'The protein in red blood cells that carries oxygen around your body.' },
      { term: 'White Blood Cell Count', definition: 'A measure of the cells your immune system uses to fight infection.' },
      { term: 'LDL Cholesterol', definition: 'Often called "bad" cholesterol — can build up in artery walls over time.' },
      { term: 'Fasting Glucose', definition: 'Your blood sugar level measured after not eating for several hours.' },
    ],
    suggestedQuestions: [
      'What does this flagged value mean for my day-to-day health?',
      'Should I repeat this test, and if so when?',
      'Does this result change anything about my current medications?',
    ],
  },
  [MedicalRecordType.IMAGING]: {
    summaryText:
      'This imaging report describes what was visible in the scan in plain language. Findings noted below are for your awareness ahead of your appointment — interpretation and next steps are for your provider to explain.',
    highlightedValues: [
      { label: 'Overall Impression', valueOptions: ['No acute abnormality noted', 'Mild degenerative changes noted', 'No acute abnormality noted'], statusOptions: [HighlightedValueStatus.NORMAL, HighlightedValueStatus.HIGH, HighlightedValueStatus.NORMAL] },
      { label: 'Comparison to Prior Imaging', valueOptions: ['Not available', 'Stable compared to prior study', 'Not available'], statusOptions: [HighlightedValueStatus.NORMAL, HighlightedValueStatus.NORMAL, HighlightedValueStatus.NORMAL] },
    ],
    glossaryTerms: [
      { term: 'Impression', definition: 'The radiologist\'s overall summary conclusion from the scan.' },
      { term: 'Degenerative changes', definition: 'Gradual, often age-related wear noted on the scan — very common and not necessarily urgent.' },
    ],
    suggestedQuestions: [
      'What does this finding mean in practical terms?',
      'Do I need any follow-up imaging?',
      'Should this change any of my current activities?',
    ],
  },
  [MedicalRecordType.PRESCRIPTION]: {
    summaryText:
      'This document lists prescribed medication details. Below is a plain-language summary of what is on the prescription — always follow the dosing instructions your prescriber gave you.',
    highlightedValues: [
      { label: 'Items Listed', valueOptions: ['1 medication', '2 medications', '3 medications'], statusOptions: [HighlightedValueStatus.NORMAL, HighlightedValueStatus.NORMAL, HighlightedValueStatus.NORMAL] },
      { label: 'Refills Noted', valueOptions: ['0 refills', '2 refills', '1 refill'], statusOptions: [HighlightedValueStatus.NORMAL, HighlightedValueStatus.NORMAL, HighlightedValueStatus.NORMAL] },
    ],
    glossaryTerms: [
      { term: 'Refill', definition: 'A repeat of this prescription that can be collected without a new consultation.' },
      { term: 'Dosage', definition: 'How much of the medication to take at each scheduled time.' },
    ],
    suggestedQuestions: [
      'What should I do if I miss a dose?',
      'Are there foods or other medications I should avoid with this?',
      'How will I know if this is working?',
    ],
  },
  [MedicalRecordType.DISCHARGE]: {
    summaryText:
      'This discharge summary outlines what happened during your visit and what to do next. Key points are highlighted below — bring any questions to your follow-up appointment.',
    highlightedValues: [
      { label: 'Follow-up Required', valueOptions: ['Yes — within 1 week', 'Yes — within 2 weeks', 'No follow-up specified'], statusOptions: [HighlightedValueStatus.HIGH, HighlightedValueStatus.HIGH, HighlightedValueStatus.NORMAL] },
      { label: 'New Medications Noted', valueOptions: ['None', '1 new medication', '2 new medications'], statusOptions: [HighlightedValueStatus.NORMAL, HighlightedValueStatus.NORMAL, HighlightedValueStatus.NORMAL] },
    ],
    glossaryTerms: [
      { term: 'Discharge summary', definition: 'A record of your visit, what was done, and what to do next.' },
      { term: 'Follow-up', definition: 'A planned next appointment to check how you\'re progressing.' },
    ],
    suggestedQuestions: [
      'What symptoms should prompt me to seek care again?',
      'When exactly should my follow-up be scheduled?',
      'Is there anything I should avoid while recovering?',
    ],
  },
  [MedicalRecordType.ECG]: {
    summaryText:
      'This ECG report records the heart\'s electrical activity. Below are key findings — please discuss any flagged items with your cardiologist or provider.',
    highlightedValues: [
      { label: 'Heart Rate', valueOptions: ['72 bpm', '110 bpm', '68 bpm'], statusOptions: [HighlightedValueStatus.NORMAL, HighlightedValueStatus.HIGH, HighlightedValueStatus.NORMAL] },
      { label: 'Rhythm', valueOptions: ['Normal sinus rhythm', 'Irregular rhythm noted', 'Normal sinus rhythm'], statusOptions: [HighlightedValueStatus.NORMAL, HighlightedValueStatus.HIGH, HighlightedValueStatus.NORMAL] },
    ],
    glossaryTerms: [
      { term: 'ECG', definition: 'A test that records the electrical signals in your heart.' },
      { term: 'Sinus rhythm', definition: 'A normal heartbeat pattern originating from the heart\'s natural pacemaker.' },
    ],
    suggestedQuestions: [
      'Do these findings explain any symptoms I\'ve had?',
      'Will I need a repeat ECG, and if so when?',
      'Should I see a cardiologist based on this result?',
    ],
  },
  [MedicalRecordType.CONSULTATION]: {
    summaryText:
      'This consultation note summarizes your visit. Below are the key discussion points and agreed next steps — follow up with your provider if anything is unclear.',
    highlightedValues: [
      { label: 'Consultation Type', valueOptions: ['In-person', 'Video', 'Phone'], statusOptions: [HighlightedValueStatus.NORMAL, HighlightedValueStatus.NORMAL, HighlightedValueStatus.NORMAL] },
      { label: 'Follow-up Planned', valueOptions: ['Yes', 'No', 'Yes'], statusOptions: [HighlightedValueStatus.NORMAL, HighlightedValueStatus.NORMAL, HighlightedValueStatus.NORMAL] },
    ],
    glossaryTerms: [
      { term: 'Consultation', definition: 'A meeting with a healthcare provider to discuss symptoms, diagnosis, or treatment.' },
      { term: 'Follow-up', definition: 'A planned next appointment to check progress or review results.' },
    ],
    suggestedQuestions: [
      'What were the main takeaways from this consultation?',
      'Are there any action items I should complete before the next visit?',
      'Who should I contact if my symptoms change?',
    ],
  },
  [MedicalRecordType.LAB_REPORT]: {
    summaryText:
      'This lab report contains test results from the diagnostic lab. Below are key findings — share any flagged items with your referring clinician.',
    highlightedValues: [
      { label: 'Report Status', valueOptions: ['Final', 'Preliminary', 'Final'], statusOptions: [HighlightedValueStatus.NORMAL, HighlightedValueStatus.NORMAL, HighlightedValueStatus.NORMAL] },
      { label: 'Abnormal Flags', valueOptions: ['None', '2 flagged', '1 flagged'], statusOptions: [HighlightedValueStatus.NORMAL, HighlightedValueStatus.HIGH, HighlightedValueStatus.NORMAL] },
    ],
    glossaryTerms: [
      { term: 'Lab report', definition: 'A document summarizing results from laboratory tests ordered by a clinician.' },
      { term: 'Reference range', definition: 'The expected values for a healthy person — used to interpret test results.' },
    ],
    suggestedQuestions: [
      'What do the flagged values mean in my context?',
      'Do I need to repeat any of these tests?',
      'How should I share these results with my care team?',
    ],
  },
};

@Injectable()
export class ReportInterpreterService {
  constructor(
    @InjectModel(ReportInterpretation.name)
    private readonly reportInterpretationModel: Model<ReportInterpretationDocument>,
    @InjectModel(MedicalRecord.name)
    private readonly medicalRecordModel: Model<MedicalRecordDocument>,
    private readonly aiInteractionLogService: AiInteractionLogService,
  ) {}

  async analyse(
    userId: string,
    dto: AnalyseReportDto,
  ): Promise<ReportInterpretationResponseDto> {
    const startedAt = Date.now();

    if (!Types.ObjectId.isValid(dto.recordId)) {
      throw new NotFoundException('Medical record not found');
    }
    const record = await this.medicalRecordModel.findOne({
      _id: dto.recordId,
      patientId: new Types.ObjectId(userId),
    });
    if (!record) {
      throw new NotFoundException('Medical record not found');
    }

    let interpretation = await this.reportInterpretationModel.findOne({
      recordId: record._id,
    });

    // Idempotent on repeat views (FR-9.2) — regenerate only if not already interpreted.
    if (!interpretation || interpretation.aiStatus !== ReportAiStatus.INTERPRETED) {
      const generated = this.generateMockInterpretation(record);
      // Non-null: upsert:true + returnDocument:'after' always returns a document.
      interpretation = (await this.reportInterpretationModel.findOneAndUpdate(
        { recordId: record._id },
        {
          $set: {
            summaryText: generated.summaryText,
            highlightedValues: generated.highlightedValues,
            glossaryTerms: generated.glossaryTerms,
            suggestedQuestions: generated.suggestedQuestions,
            aiStatus: ReportAiStatus.INTERPRETED,
          },
        },
        { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true },
      ))!;
    }

    await this.aiInteractionLogService.record({
      userId,
      service: AiService.REPORT_INTERPRETER,
      input: { recordId: dto.recordId, recordType: record.type },
      outcome: {
        interpretationId: interpretation.id,
        highlightedCount: interpretation.highlightedValues.length,
      },
      latencyMs: Date.now() - startedAt,
      source: AiSource.MOCK,
      flagged: interpretation.highlightedValues.some(
        (v) => v.status !== HighlightedValueStatus.NORMAL,
      ),
    });

    return this.toResponse(interpretation);
  }

  async findOne(
    userId: string,
    recordId: string,
  ): Promise<ReportInterpretationResponseDto> {
    if (!Types.ObjectId.isValid(recordId)) {
      throw new NotFoundException('Report interpretation not found');
    }
    const record = await this.medicalRecordModel.findOne({
      _id: recordId,
      patientId: new Types.ObjectId(userId),
    });
    if (!record) {
      throw new NotFoundException('Report interpretation not found');
    }
    const interpretation = await this.reportInterpretationModel.findOne({
      recordId: record._id,
    });
    if (!interpretation) {
      throw new NotFoundException('Report interpretation not found');
    }
    return this.toResponse(interpretation);
  }

  private generateMockInterpretation(record: MedicalRecordDocument): {
    summaryText: string;
    highlightedValues: HighlightedValue[];
    glossaryTerms: GlossaryTerm[];
    suggestedQuestions: string[];
  } {
    const template = TEMPLATES[record.type];
    const seed = record.id as string;

    const highlightedValues: HighlightedValue[] = template.highlightedValues.map(
      (h, i) => {
        const idx = this.hashToIndex(`${seed}:${i}`, h.valueOptions.length);
        return {
          label: h.label,
          value: h.valueOptions[idx],
          status: h.statusOptions[idx],
        };
      },
    );

    return {
      summaryText: template.summaryText,
      highlightedValues,
      glossaryTerms: template.glossaryTerms,
      suggestedQuestions: template.suggestedQuestions,
    };
  }

  // Stable pseudo-random index from a string seed — deterministic mock
  // variety, not a cryptographic hash and not model reasoning.
  private hashToIndex(seed: string, mod: number): number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash * 31 + seed.charCodeAt(i)) % 2147483647;
    }
    return mod > 0 ? Math.abs(hash) % mod : 0;
  }

  private toResponse(
    interpretation: ReportInterpretationDocument,
  ): ReportInterpretationResponseDto {
    return {
      id: interpretation.id,
      recordId: interpretation.recordId.toString(),
      summaryText: interpretation.summaryText,
      highlightedValues: interpretation.highlightedValues.map((v) => ({
        label: v.label,
        value: v.value,
        status: v.status,
      })),
      glossaryTerms: interpretation.glossaryTerms.map((g) => ({
        term: g.term,
        definition: g.definition,
      })),
      suggestedQuestions: interpretation.suggestedQuestions,
      aiStatus: interpretation.aiStatus,
      source: AiSource.MOCK,
      disclaimer: AI_DISCLAIMER,
    };
  }
}
