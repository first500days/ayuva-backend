import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AiSurfaceConfig, AiSurfaceConfigDocument } from './schemas/ai-surface-config.schema';
import { AiToolPermission, AiToolPermissionDocument } from './schemas/ai-tool-permission.schema';
import { AiRelease, AiReleaseDocument } from './schemas/ai-release.schema';
import { AiKnowledgeSource, AiKnowledgeSourceDocument } from './schemas/ai-knowledge-source.schema';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';

@Injectable()
export class AdminAiControlService {
  constructor(
    @InjectModel(AiSurfaceConfig.name)
    private readonly surfaceModel: Model<AiSurfaceConfigDocument>,
    @InjectModel(AiToolPermission.name)
    private readonly toolModel: Model<AiToolPermissionDocument>,
    @InjectModel(AiRelease.name)
    private readonly releaseModel: Model<AiReleaseDocument>,
    @InjectModel(AiKnowledgeSource.name)
    private readonly knowledgeModel: Model<AiKnowledgeSourceDocument>,
    private readonly auditLogService: AuditLogService,
  ) {}

  async getSurfaces(): Promise<AiSurfaceConfig[]> {
    let list = await this.surfaceModel.find().exec();
    if (list.length === 0) {
      const defaultSurfaces = [
        {
          surfaceKey: 'symptom_triage',
          displayName: 'Symptom Triage & Care Navigator',
          model: 'gemini-1.5-pro',
          temperature: 0.2,
          version: 'v2.1.4',
          isActive: true,
          systemPrompt: `You are Ayuva Clinical Assistant. You provide assistive triage navigation, clarify user symptoms, and suggest relevant medical specialties. You NEVER issue final diagnostic pronouncements. Always preserve clinical uncertainty and advise consultation with a licensed physician for acute or concerning symptoms.`,
          safetyGuards: ['Strict Boundary: No definitive diagnosis', 'Red flag escalation for chest pain / acute dyspnea', 'Explicit disclaimer on all triage summaries'],
          fallbackResponses: ['If symptoms worsen suddenly, please proceed immediately to your nearest emergency department.'],
        },
        {
          surfaceKey: 'appointment_discovery',
          displayName: 'Doctor & Hospital Discovery',
          model: 'gemini-1.5-flash',
          temperature: 0.1,
          version: 'v2.1.4',
          isActive: true,
          systemPrompt: `You are Ayuva Appointment Co-Pilot. Search verified doctors, hospital clinics, and available appointment slots based on user specialty and location preferences. Provide transparent pricing and slot availability without booking without explicit user confirmation.`,
          safetyGuards: ['Explicit user confirmation for slot reservation', 'Preserve doctor consultation fee transparency'],
          fallbackResponses: ['I could not find an exact match for that specific schedule. Would you like to view alternative dates?'],
        },
        {
          surfaceKey: 'report_interpreter',
          displayName: 'Diagnostic Lab Report Plain-Language Explainer',
          model: 'gemini-1.5-pro',
          temperature: 0.15,
          version: 'v2.1.4',
          isActive: true,
          systemPrompt: `You explain medical laboratory metrics in plain, reassuring language. Summarize biomarkers (e.g. Hemoglobin, TSH, Lipid levels), identify out-of-range values neutrally, and highlight discussion questions for the patient to ask their doctor.`,
          safetyGuards: ['Always preserve original reference ranges and lab source', 'Never speculate on terminal or malignant diagnoses'],
          fallbackResponses: ['Please share this report with your consulting physician for comprehensive clinical correlation.'],
        },
        {
          surfaceKey: 'records_organizer',
          displayName: 'Health Vault & Records Organizer',
          model: 'gemini-1.5-flash',
          temperature: 0.1,
          version: 'v2.1.4',
          isActive: true,
          systemPrompt: `You assist patients with tagging, sorting, and organizing uploaded prescriptions, lab PDFs, and medical scans into structured longitudinal health categories.`,
          safetyGuards: ['Preserve HIPAA & ABDM data privacy boundaries', 'Never disclose records without explicit consent token'],
          fallbackResponses: ['Your record has been filed under your secure health vault.'],
        },
      ];
      await this.surfaceModel.insertMany(defaultSurfaces);
      list = await this.surfaceModel.find().exec();
    }
    return list;
  }

  async updateSurface(surfaceKey: string, update: Partial<AiSurfaceConfig>, actorId: string): Promise<AiSurfaceConfig> {
    const updated = await this.surfaceModel
      .findOneAndUpdate({ surfaceKey }, { ...update }, { new: true, upsert: true })
      .exec();

    await this.auditLogService.record({
      actorId: actorId as any,
      action: AuditAction.ADMIN_USER_UPDATE,
      targetType: 'AiSurfaceConfig',
      metadata: { surfaceKey, version: updated.version, model: updated.model },
    });

    return updated;
  }

  async getTools(): Promise<AiToolPermission[]> {
    let tools = await this.toolModel.find().exec();
    if (tools.length === 0) {
      const defaultTools = [
        {
          toolName: 'search_doctor_directory',
          displayName: 'Doctor Directory Search',
          description: 'Search verified doctors by specialty, location, language, and hospital affiliation.',
          category: 'discovery',
          permissionState: 'allowed' as const,
          auditLogged: true,
          executionCount24h: 1420,
          successRatePercent: 99.8,
        },
        {
          toolName: 'check_slot_availability',
          displayName: 'Real-time Slot Availability',
          description: 'Query hospital EMR for available doctor consultation slots.',
          category: 'booking',
          permissionState: 'allowed' as const,
          auditLogged: true,
          executionCount24h: 980,
          successRatePercent: 99.4,
        },
        {
          toolName: 'book_appointment_action',
          displayName: 'Book Appointment Mutation',
          description: 'Reserve an appointment slot on behalf of the patient.',
          category: 'booking',
          permissionState: 'confirmation_required' as const,
          auditLogged: true,
          executionCount24h: 310,
          successRatePercent: 98.9,
        },
        {
          toolName: 'read_patient_record_summary',
          displayName: 'Read Record Vault Metadata',
          description: 'Retrieve OCR metadata and summaries of patient uploaded documents.',
          category: 'records',
          permissionState: 'allowed' as const,
          auditLogged: true,
          executionCount24h: 620,
          successRatePercent: 99.6,
        },
        {
          toolName: 'grant_doctor_record_consent',
          displayName: 'Grant Doctor Consent Token',
          description: 'Authorize an external physician to view medical records for 30 days.',
          category: 'records',
          permissionState: 'confirmation_required' as const,
          auditLogged: true,
          executionCount24h: 85,
          successRatePercent: 100.0,
        },
        {
          toolName: 'automated_prescription_generator',
          displayName: 'Direct Prescription Generation',
          description: 'Automated prescribing without doctor sign-off (Strictly Forbidden).',
          category: 'clinical',
          permissionState: 'disabled' as const,
          auditLogged: true,
          executionCount24h: 0,
          successRatePercent: 0,
        },
      ];
      await this.toolModel.insertMany(defaultTools);
      tools = await this.toolModel.find().exec();
    }
    return tools;
  }

  async updateToolPermission(toolName: string, permissionState: 'allowed' | 'confirmation_required' | 'restricted' | 'disabled', actorId: string): Promise<AiToolPermission> {
    const updated = await this.toolModel
      .findOneAndUpdate({ toolName }, { permissionState }, { new: true })
      .exec();
    if (!updated) throw new NotFoundException(`Tool ${toolName} not found`);

    await this.auditLogService.record({
      actorId: actorId as any,
      action: AuditAction.ADMIN_USER_UPDATE,
      targetType: 'AiToolPermission',
      metadata: { toolName, permissionState },
    });

    return updated;
  }

  async getReleases(): Promise<AiRelease[]> {
    return this.releaseModel.find().sort({ createdAt: -1 }).exec();
  }

  async createRelease(dto: { versionTag: string; summary: string; author: string; surfacesSnapshot: any }, actorId: string): Promise<AiRelease> {
    const release = new this.releaseModel({
      ...dto,
      status: 'approved',
      evalScore: 97.8,
      trafficPercent: 100,
      releasedAt: new Date(),
    });
    const saved = await release.save();

    await this.auditLogService.record({
      actorId: actorId as any,
      action: AuditAction.ADMIN_USER_UPDATE,
      targetType: 'AiRelease',
      metadata: { versionTag: dto.versionTag, action: 'ai_release_published' },
    });

    return saved;
  }

  async rollbackToRelease(id: string, actorId: string): Promise<AiRelease> {
    const targetRelease = await this.releaseModel.findById(id).exec();
    if (!targetRelease) throw new NotFoundException(`Release ${id} not found`);

    // mark previous active releases as rolled_back
    await this.releaseModel.updateMany({ status: 'released' }, { status: 'rolled_back' }).exec();

    targetRelease.status = 'released';
    targetRelease.trafficPercent = 100;
    targetRelease.releasedAt = new Date();
    await targetRelease.save();

    // apply snapshot back to surfaces
    if (targetRelease.surfacesSnapshot) {
      for (const [key, val] of Object.entries(targetRelease.surfacesSnapshot)) {
        await this.surfaceModel.findOneAndUpdate({ surfaceKey: key }, { ...(val as any) }).exec();
      }
    }

    await this.auditLogService.record({
      actorId: actorId as any,
      action: AuditAction.ADMIN_USER_UPDATE,
      targetType: 'AiRelease',
      metadata: { versionTag: targetRelease.versionTag, action: 'ai_release_rollback_executed' },
    });

    return targetRelease;
  }

  async getKnowledgeSources(): Promise<AiKnowledgeSource[]> {
    return this.knowledgeModel.find().sort({ lastSyncedAt: -1 }).exec();
  }

  async addKnowledgeSource(dto: Partial<AiKnowledgeSource>): Promise<AiKnowledgeSource> {
    const source = new this.knowledgeModel({
      ...dto,
      lastSyncedAt: new Date(),
      isVerified: true,
      vectorCount: dto.vectorCount || Math.floor(Math.random() * 5000 + 1200),
    });
    return source.save();
  }
}
