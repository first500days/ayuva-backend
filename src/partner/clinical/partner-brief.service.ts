import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { patientAge } from '../../common/utils/age.util';
import {
  HealthProfile,
  HealthProfileDocument,
} from '../../core/health-profile/schemas/health-profile.schema';
import { PartnerActor } from '../rbac/partner-perm.guard';
import {
  AdmissionDocument,
  AdmissionStatus,
  PartnerAdmission,
} from '../hospital/schemas/admission.schema';
import {
  ConsultationNote,
  ConsultationNoteDocument,
  NoteStatus,
} from './schemas/consultation-note.schema';
import { PartnerTimelineService } from './partner-timeline.service';
import { composeBrief, pickLabs } from './patient-brief';

export const BRIEF_NOTE =
  'Built by rules from the records your organisation can see — coded diagnoses, patient-reported conditions, admissions, the last signed note, active prescriptions and flagged lab results. Nothing is inferred; check the records before relying on it.';

/** The one-paragraph patient summary at the top of a consultation. */
@Injectable()
export class PartnerBriefService {
  constructor(
    @InjectModel(ConsultationNote.name)
    private readonly noteModel: Model<ConsultationNoteDocument>,
    @InjectModel(HealthProfile.name)
    private readonly profileModel: Model<HealthProfileDocument>,
    @InjectModel(PartnerAdmission.name)
    private readonly admissionModel: Model<AdmissionDocument>,
    private readonly timeline: PartnerTimelineService,
  ) {}

  async brief(actor: PartnerActor, patientId: string) {
    // The timeline checks the link, logs the access and resolves shared lab results.
    const t = await this.timeline.timeline(actor, patientId);
    const pid = t.patient.id;
    const [notes, profile, admission] = await Promise.all([
      this.noteModel
        .find({
          providerId: actor.provider._id,
          patientId: pid,
          status: NoteStatus.SIGNED,
        })
        .sort({ signedAt: -1 })
        .limit(50)
        .exec(),
      this.profileModel
        .findOne({ userId: pid })
        .select('age dateOfBirth gender conditions')
        .lean()
        .exec(),
      this.admissionModel
        .findOne({
          providerId: actor.provider._id,
          patientId: pid,
          status: AdmissionStatus.ADMITTED,
        })
        .sort({ admittedAt: -1 })
        .exec(),
    ]);
    const conditions: {
      label: string;
      since?: Date;
      source: 'diagnosed' | 'patient';
    }[] = [];
    // Oldest diagnosis date first per code, listed newest first.
    const firstSeen = new Map<string, { label: string; since?: Date }>();
    for (const n of [...notes].reverse())
      for (const d of n.diagnoses ?? [])
        if (!firstSeen.has(d.icd11))
          firstSeen.set(d.icd11, { label: d.display, since: n.signedAt });
    for (const c of [...firstSeen.values()].reverse())
      conditions.push({ ...c, source: 'diagnosed' });
    for (const c of profile?.conditions ?? [])
      if (c.trim() && !/^(none|nil|no|na|n\/a|-)$/i.test(c.trim()))
        conditions.push({ label: c.trim(), source: 'patient' });

    const last = notes[0];
    const lastSummary = last
      ? last.sections?.assessment?.trim() ||
        last.diagnoses?.map((d) => d.display).join(', ') ||
        last.sections?.chiefComplaint?.trim() ||
        ''
      : '';
    const medications = [
      ...new Set(t.medications.filter((m) => m.active).map((m) => m.medicine)),
    ];
    const labs = pickLabs(t.labTrends);
    const { age } = patientAge(profile);
    const paragraph = composeBrief({
      name: t.patient.name,
      age,
      gender: profile?.gender,
      conditions,
      admission: admission
        ? {
            ward: `${admission.wardName} (${admission.bedLabel})`,
            since: admission.admittedAt,
            reason: admission.reason || undefined,
          }
        : null,
      lastVisit:
        last && last.signedAt && lastSummary
          ? { at: last.signedAt, by: last.authorName, summary: lastSummary }
          : null,
      medications,
      labs,
    });
    return {
      paragraph,
      generatedAt: new Date().toISOString(),
      sources: {
        signedNotes: notes.length,
        activeMedicines: medications.length,
        labParameters: t.labTrends.length,
        patientReportedConditions: conditions.filter(
          (c) => c.source === 'patient',
        ).length,
        sharedRecords: t.activeShares,
      },
      note: BRIEF_NOTE,
    };
  }
}
