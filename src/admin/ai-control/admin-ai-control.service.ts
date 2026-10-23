import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AiSurfaceConfig, AiSurfaceConfigDocument } from './schemas/ai-surface-config.schema';
import { AiToolPermission, AiToolPermissionDocument } from './schemas/ai-tool-permission.schema';
import { AiRelease, AiReleaseDocument } from './schemas/ai-release.schema';
import { AiKnowledgeSource, AiKnowledgeSourceDocument } from './schemas/ai-knowledge-source.schema';
import {
  AiSurfaceVersion,
  AiSurfaceVersionDocument,
  SurfaceVersionStatus,
} from './schemas/ai-surface-version.schema';
import { nextPatchVersion } from './surface-versions.util';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import { AppNotificationsService } from '../../notifications/app-notifications.service';

export interface AvailableModel {
  id: string;
  name: string;
  description: string;
  maxTokens: number;
  supportsTools: boolean;
  category: 'reasoning' | 'fast' | 'experimental';
}

/** Who is acting, for audit entries and version history. */
export interface AiControlActor {
  id: string;
  email?: string;
}

/** The fields that change what the model is told — editing any of them makes a new version. */
const PROMPT_FIELDS = [
  'model',
  'temperature',
  'systemPrompt',
  'safetyGuards',
  'fallbackResponses',
] as const;
const EDITABLE_FIELDS = [...PROMPT_FIELDS, 'displayName', 'isActive'] as const;

export interface SurfaceVersionSummary {
  version: string;
  model: string;
  temperature: number;
  activatedAt: string;
  activatedBy?: string;
  systemPromptPreview: string;
}

export interface RollbackTargetResponse {
  surfaceKey: string;
  displayName: string;
  current: { version: string; liveSince: string };
  target: SurfaceVersionSummary | null;
}

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
    @InjectModel(AiSurfaceVersion.name)
    private readonly versionModel: Model<AiSurfaceVersionDocument>,
    private readonly auditLogService: AuditLogService,
    private readonly notifications: AppNotificationsService,
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

  /**
   * Saves a surface. Changing anything the model is told (model, temperature,
   * prompt, guardrails, fallbacks) makes a new version: the outgoing config
   * becomes the rollback target and the version number is bumped here —
   * clients can't set it.
   */
  async updateSurface(
    surfaceKey: string,
    update: Partial<Pick<AiSurfaceConfig, (typeof EDITABLE_FIELDS)[number]>>,
    actor: AiControlActor,
  ): Promise<AiSurfaceConfigDocument> {
    const surface = await this.getSurfaceOrThrow(surfaceKey);
    const changed = PROMPT_FIELDS.filter(
      (field) =>
        update[field] !== undefined &&
        JSON.stringify(update[field]) !== JSON.stringify(surface[field]),
    );
    const fromVersion = surface.version;

    if (changed.length > 0) {
      const outgoing = await this.ensureLiveVersion(surface);
      outgoing.status = SurfaceVersionStatus.SUPERSEDED;
      outgoing.supersededAt = new Date();
      await outgoing.save();
    }
    for (const field of EDITABLE_FIELDS) {
      if (update[field] !== undefined) surface.set(field, update[field]);
    }
    if (changed.length > 0) {
      const history = await this.versionModel.find({ surfaceKey }).select('version').lean().exec();
      surface.version = nextPatchVersion([surface.version, ...history.map((v) => v.version)]);
    }
    await surface.save();

    if (changed.length > 0) {
      await this.versionModel.create({
        ...this.snapshot(surface),
        status: SurfaceVersionStatus.LIVE,
        activatedAt: new Date(),
        activatedBy: actor.email,
      });
    }
    await this.auditLogService.record({
      actorId: actor.id,
      action: AuditAction.ADMIN_AI_PROMPT_UPDATE,
      targetType: 'AiSurfaceConfig',
      targetId: surface.id,
      metadata: { surfaceKey, fromVersion, toVersion: surface.version, changed },
    });
    return surface;
  }

  /** What "Rollback to Last Stable Prompt" would restore, for the confirmation dialog. */
  async getRollbackTarget(surfaceKey: string): Promise<RollbackTargetResponse> {
    const surface = await this.getSurfaceOrThrow(surfaceKey);
    const live = await this.ensureLiveVersion(surface);
    const target = await this.lastStableVersion(surfaceKey);
    return {
      surfaceKey,
      displayName: surface.displayName,
      current: {
        version: surface.version,
        liveSince: (live.restoredAt ?? live.activatedAt).toISOString(),
      },
      target: target ? this.summary(target) : null,
    };
  }

  /**
   * Emergency escape hatch: puts the most recently replaced version back live.
   * The version being replaced is marked rolled back, so it is never offered
   * as a rollback target again; every admin is notified.
   */
  async rollbackSurface(
    surfaceKey: string,
    reason: string | undefined,
    actor: AiControlActor,
  ): Promise<AiSurfaceConfigDocument> {
    const surface = await this.getSurfaceOrThrow(surfaceKey);
    const target = await this.lastStableVersion(surfaceKey);
    if (!target) {
      throw new BadRequestException(
        `${surface.displayName} has no earlier stable prompt version to roll back to`,
      );
    }
    const live = await this.ensureLiveVersion(surface);
    const now = new Date();
    live.status = SurfaceVersionStatus.ROLLED_BACK;
    live.rolledBackAt = now;
    live.rolledBackBy = actor.email;
    live.rollbackReason = reason?.trim() || undefined;
    await live.save();

    target.status = SurfaceVersionStatus.LIVE;
    target.restoredAt = now;
    await target.save();

    surface.set({
      model: target.model,
      temperature: target.temperature,
      systemPrompt: target.systemPrompt,
      safetyGuards: target.safetyGuards,
      fallbackResponses: target.fallbackResponses,
      version: target.version,
    });
    await surface.save();

    await this.auditLogService.record({
      actorId: actor.id,
      action: AuditAction.ADMIN_AI_PROMPT_ROLLBACK,
      targetType: 'AiSurfaceConfig',
      targetId: surface.id,
      metadata: {
        surfaceKey,
        fromVersion: live.version,
        toVersion: target.version,
        reason: live.rollbackReason,
      },
    });
    await this.notifications.notifyAdmins({
      trigger: 'ai_prompt_rollback',
      title: 'AI prompt rolled back',
      message: `${surface.displayName} was rolled back from ${live.version} to ${target.version}.`,
      lockScreenText: 'An AI configuration was rolled back',
      actionLabel: 'Review',
      actionRoute: '/admin/ai-control',
    });
    return surface;
  }

  /**
   * Compliance hold: stops the surface running on one record type (or all of
   * them) until a manual review lifts it. Records the prompt version in force.
   */
  async pauseSurface(
    surfaceKey: string,
    hold: { recordType: string; reason: string; caseRef?: string },
    actor: AiControlActor,
  ): Promise<AiSurfaceConfigDocument> {
    const surface = await this.getSurfaceOrThrow(surfaceKey);
    if (surface.pauses.some((p) => p.recordType === hold.recordType)) return surface;
    surface.pauses.push({
      recordType: hold.recordType,
      reason: hold.reason,
      caseRef: hold.caseRef,
      promptVersion: surface.version,
      pausedAt: new Date(),
      pausedBy: actor.email,
    });
    await surface.save();
    await this.auditLogService.record({
      actorId: actor.id,
      action: AuditAction.ADMIN_AI_PROMPT_PAUSE,
      targetType: 'AiSurfaceConfig',
      targetId: surface.id,
      metadata: { surfaceKey, ...hold, promptVersion: surface.version },
    });
    return surface;
  }

  /** Lifts a hold once its manual review is complete (no recordType lifts every hold). */
  async resumeSurface(
    surfaceKey: string,
    recordType: string | undefined,
    actor: AiControlActor,
  ): Promise<AiSurfaceConfigDocument> {
    const surface = await this.getSurfaceOrThrow(surfaceKey);
    const lifted = surface.pauses.filter((p) => !recordType || p.recordType === recordType);
    if (lifted.length === 0) {
      throw new BadRequestException(`${surface.displayName} is not paused for that document type`);
    }
    surface.pauses = surface.pauses.filter((p) => !lifted.includes(p));
    await surface.save();
    await this.auditLogService.record({
      actorId: actor.id,
      action: AuditAction.ADMIN_AI_PROMPT_RESUME,
      targetType: 'AiSurfaceConfig',
      targetId: surface.id,
      metadata: {
        surfaceKey,
        recordTypes: lifted.map((p) => p.recordType),
        caseRefs: lifted.map((p) => p.caseRef).filter(Boolean),
      },
    });
    return surface;
  }

  /**
   * The prompt version that produced an output at `at`: the latest version
   * activated by then. `inferred` because outputs from before version
   * history carry no version of their own.
   */
  async versionLiveAt(surfaceKey: string, at: Date): Promise<SurfaceVersionSummary & { inferred: true }> {
    const surface = await this.getSurfaceOrThrow(surfaceKey);
    await this.ensureLiveVersion(surface);
    const row =
      (await this.versionModel
        .findOne({ surfaceKey, activatedAt: { $lte: at } })
        .sort({ activatedAt: -1 })
        .exec()) ??
      (await this.versionModel.findOne({ surfaceKey }).sort({ activatedAt: 1 }).exec());
    return { ...this.summary(row!), inferred: true };
  }

  /** The surface's LIVE version row — created from its current config the first time. */
  private async ensureLiveVersion(surface: AiSurfaceConfigDocument): Promise<AiSurfaceVersionDocument> {
    const live = await this.versionModel
      .findOne({ surfaceKey: surface.surfaceKey, status: SurfaceVersionStatus.LIVE })
      .exec();
    if (live) return live;
    return this.versionModel.create({
      ...this.snapshot(surface),
      status: SurfaceVersionStatus.LIVE,
      activatedAt: surface.updatedAt ?? surface.createdAt ?? new Date(),
      activatedBy: 'system (before version history)',
    });
  }

  private lastStableVersion(surfaceKey: string) {
    return this.versionModel
      .findOne({ surfaceKey, status: SurfaceVersionStatus.SUPERSEDED })
      .sort({ supersededAt: -1 })
      .exec();
  }

  private snapshot(surface: AiSurfaceConfigDocument) {
    return {
      surfaceKey: surface.surfaceKey,
      version: surface.version,
      model: surface.model,
      temperature: surface.temperature,
      systemPrompt: surface.systemPrompt,
      safetyGuards: [...(surface.safetyGuards ?? [])],
      fallbackResponses: [...(surface.fallbackResponses ?? [])],
    };
  }

  private summary(v: AiSurfaceVersionDocument): SurfaceVersionSummary {
    return {
      version: v.version,
      model: v.model,
      temperature: v.temperature,
      activatedAt: v.activatedAt.toISOString(),
      activatedBy: v.activatedBy,
      systemPromptPreview: v.systemPrompt.slice(0, 280),
    };
  }

  private async getSurfaceOrThrow(surfaceKey: string): Promise<AiSurfaceConfigDocument> {
    // The default surfaces are created on first read.
    let surface = await this.surfaceModel.findOne({ surfaceKey }).exec();
    if (!surface) {
      await this.getSurfaces();
      surface = await this.surfaceModel.findOne({ surfaceKey }).exec();
    }
    if (!surface) throw new NotFoundException(`AI surface ${surfaceKey} not found`);
    return surface;
  }

  async getAvailableModels(): Promise<AvailableModel[]> {
    return [
      {
        id: 'gemini-1.5-pro',
        name: 'Gemini 1.5 Pro',
        description: 'Complex Clinical Reasoning - Best for diagnostic assistance and care planning',
        maxTokens: 2000000,
        supportsTools: true,
        category: 'reasoning',
      },
      {
        id: 'gemini-1.5-flash',
        name: 'Gemini 1.5 Flash',
        description: 'Ultra-Low Latency Navigation - Best for real-time triage and discovery',
        maxTokens: 1000000,
        supportsTools: true,
        category: 'fast',
      },
      {
        id: 'gemini-1.0-pro',
        name: 'Gemini 1.0 Pro',
        description: 'Balanced Performance - General purpose clinical assistant',
        maxTokens: 1000000,
        supportsTools: true,
        category: 'reasoning',
      },
      {
        id: 'gemini-ultra',
        name: 'Gemini Ultra',
        description: 'Experimental Diagnostic Assistant - Highest capability, research preview',
        maxTokens: 2000000,
        supportsTools: true,
        category: 'experimental',
      },
    ];
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

    await this.releaseModel.updateMany({ status: 'released' }, { status: 'rolled_back' }).exec();

    targetRelease.status = 'released';
    targetRelease.trafficPercent = 100;
    targetRelease.releasedAt = new Date();
    await targetRelease.save();

    if (targetRelease.surfacesSnapshot) {
      // Through updateSurface, so each restored prompt gets a version and stays rollback-able.
      for (const [key, val] of Object.entries(targetRelease.surfacesSnapshot)) {
        await this.updateSurface(key, val as Partial<AiSurfaceConfig>, { id: actorId });
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

  async addKnowledgeSource(dto: Partial<AiKnowledgeSource>, actorId: string): Promise<AiKnowledgeSource> {
    const source = new this.knowledgeModel({
      ...dto,
      lastSyncedAt: new Date(),
      isVerified: true,
      vectorCount: dto.vectorCount || Math.floor(Math.random() * 5000 + 1200),
    });
    const saved = await source.save();

    await this.auditLogService.record({
      actorId: actorId as any,
      action: AuditAction.ADMIN_USER_UPDATE,
      targetType: 'AiKnowledgeSource',
      metadata: { action: 'knowledge_source_added', title: saved.title, category: saved.category },
    });

    return saved;
  }

  async updateKnowledgeSource(id: string, dto: Partial<AiKnowledgeSource>, actorId: string): Promise<AiKnowledgeSource> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Knowledge source not found');
    }
    const updated = await this.knowledgeModel
      .findByIdAndUpdate(id, { ...dto, lastSyncedAt: new Date() }, { new: true })
      .exec();
    if (!updated) throw new NotFoundException('Knowledge source not found');

    await this.auditLogService.record({
      actorId: actorId as any,
      action: AuditAction.ADMIN_USER_UPDATE,
      targetType: 'AiKnowledgeSource',
      metadata: { action: 'knowledge_source_updated', title: updated.title, id: updated.id },
    });

    return updated;
  }

  async deleteKnowledgeSource(id: string, actorId: string): Promise<{ message: string }> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Knowledge source not found');
    }
    const deleted = await this.knowledgeModel.findByIdAndDelete(id).exec();
    if (!deleted) throw new NotFoundException('Knowledge source not found');

    await this.auditLogService.record({
      actorId: actorId as any,
      action: AuditAction.ADMIN_USER_UPDATE,
      targetType: 'AiKnowledgeSource',
      metadata: { action: 'knowledge_source_deleted', title: deleted.title, id: deleted.id },
    });

    return { message: 'Knowledge source deleted successfully' };
  }

  async syncKnowledgeSource(id: string, actorId: string): Promise<AiKnowledgeSource> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Knowledge source not found');
    }
    
    // Simulate sync - in production this would connect to the vector DB
    const updated = await this.knowledgeModel
      .findByIdAndUpdate(
        id, 
        { 
          lastSyncedAt: new Date(),
          vectorCount: Math.floor(Math.random() * 5000 + 1200),
          isVerified: true,
        }, 
        { new: true }
      )
      .exec();
    if (!updated) throw new NotFoundException('Knowledge source not found');

    await this.auditLogService.record({
      actorId: actorId as any,
      action: AuditAction.ADMIN_USER_UPDATE,
      targetType: 'AiKnowledgeSource',
      metadata: { action: 'knowledge_source_synced', title: updated.title, vectorCount: updated.vectorCount },
    });

    return updated;
  }

  async reindexKnowledgeSource(id: string, actorId: string): Promise<{ message: string; vectorCount: number }> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Knowledge source not found');
    }
    
    // Simulate reindex - in production this would rebuild the vector index
    const newVectorCount = Math.floor(Math.random() * 10000 + 5000);
    const updated = await this.knowledgeModel
      .findByIdAndUpdate(
        id, 
        { 
          lastSyncedAt: new Date(),
          vectorCount: newVectorCount,
          isVerified: true,
        }, 
        { new: true }
      )
      .exec();
    if (!updated) throw new NotFoundException('Knowledge source not found');

    await this.auditLogService.record({
      actorId: actorId as any,
      action: AuditAction.ADMIN_USER_UPDATE,
      targetType: 'AiKnowledgeSource',
      metadata: { action: 'knowledge_source_reindexed', title: updated.title, vectorCount: newVectorCount },
    });

    return { message: 'Knowledge source reindexed successfully', vectorCount: newVectorCount };
  }
}