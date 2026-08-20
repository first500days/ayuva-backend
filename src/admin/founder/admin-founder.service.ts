import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FounderDoc, FounderDocDocument } from './schemas/founder-doc.schema';
import { FounderMilestone, FounderMilestoneDocument } from './schemas/founder-milestone.schema';
import { FounderRisk, FounderRiskDocument } from './schemas/founder-risk.schema';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';

@Injectable()
export class AdminFounderService {
  constructor(
    @InjectModel(FounderDoc.name)
    private readonly docModel: Model<FounderDocDocument>,
    @InjectModel(FounderMilestone.name)
    private readonly milestoneModel: Model<FounderMilestoneDocument>,
    @InjectModel(FounderRisk.name)
    private readonly riskModel: Model<FounderRiskDocument>,
    private readonly auditLogService: AuditLogService,
  ) {}

  async getExecutiveMetrics() {
    return {
      arr: 14200000, // ₹1.42 Cr
      mrr: 1183333,
      momGrowthPercent: 18.4,
      grossMarginPercent: 72.8,
      netBurnRateMonthly: 350000,
      runwayMonths: 28,
      activePatientRetentionRate: 84.5,
      ltvCacRatio: 4.8,
      totalCapitalRaised: 30000000,
      cashInBank: 9800000,
      strategicPartnerCount: 42,
    };
  }

  async getDocuments(actorId: string, actorName = 'Founder'): Promise<FounderDoc[]> {
    let docs = await this.docModel.find().sort({ createdAt: -1 }).exec();
    if (docs.length === 0) {
      const defaultDocs = [
        {
          title: 'Ayuva Series-A Pitch Deck & Growth Thesis.pdf',
          category: 'investor' as const,
          confidentialityLevel: 'strictly_confidential' as const,
          fileUrl: '/vault/docs/Ayuva_Series_A_Deck.pdf',
          uploadedBy: 'Founder',
          fileSizeBytes: 4200000,
          accessCount: 14,
        },
        {
          title: 'Board Resolutions & FY26 Budget Approval.pdf',
          category: 'board' as const,
          confidentialityLevel: 'strictly_confidential' as const,
          fileUrl: '/vault/docs/Board_Resolutions_FY26.pdf',
          uploadedBy: 'Founder',
          fileSizeBytes: 1850000,
          accessCount: 8,
        },
        {
          title: 'Master Hospital Network Master Services Agreement (MSA).pdf',
          category: 'legal' as const,
          confidentialityLevel: 'restricted' as const,
          fileUrl: '/vault/docs/Hospital_Network_MSA.pdf',
          uploadedBy: 'Legal Counsel',
          fileSizeBytes: 2400000,
          accessCount: 22,
        },
        {
          title: 'Ayuva AI 5-Year Clinical Evaluation & Governance Strategy.pdf',
          category: 'strategy' as const,
          confidentialityLevel: 'strictly_confidential' as const,
          fileUrl: '/vault/docs/AI_Clinical_Strategy_2026_2031.pdf',
          uploadedBy: 'Dr. Sarah Jenkins',
          fileSizeBytes: 3100000,
          accessCount: 19,
        },
      ];
      await this.docModel.insertMany(defaultDocs);
      docs = await this.docModel.find().sort({ createdAt: -1 }).exec();
    }

    await this.auditLogService.record({
      actorId: actorId as any,
      action: AuditAction.RECORD_VIEW,
      targetType: 'FounderVaultDocuments',
      metadata: { action: 'founder_vault_accessed', actorName },
    });
    return docs;
  }

  async createDocument(data: Partial<FounderDoc>, actorId: string, actorName = 'Founder'): Promise<FounderDoc> {
    const doc = new this.docModel({
      ...data,
      uploadedBy: actorName,
    });
    const saved = await doc.save();

    await this.auditLogService.record({
      actorId: actorId as any,
      action: AuditAction.ADMIN_USER_CREATE,
      targetType: 'FounderDoc',
      targetId: saved._id as any,
      metadata: { title: saved.title, confidentiality: saved.confidentialityLevel },
    });

    return saved;
  }

  async getMilestones(): Promise<FounderMilestone[]> {
    let list = await this.milestoneModel.find().sort({ targetQuarter: 1 }).exec();
    if (list.length === 0) {
      const defaultMilestones = [
        {
          title: 'Enterprise Hospital EMR Bi-Directional Synchronization',
          targetQuarter: 'Q3 2026',
          status: 'in_progress' as const,
          owner: 'Engineering & Integration Ops',
          progressPercent: 78,
          notes: 'Integration running in staging testing across 4 hospital groups.',
        },
        {
          title: 'ISO-27001 & ABDM Milestone 3 Production Audit',
          targetQuarter: 'Q3 2026',
          status: 'in_progress' as const,
          owner: 'Security & Compliance',
          progressPercent: 85,
          notes: 'Final auditor review scheduled for mid-September.',
        },
        {
          title: 'Expansion into Mumbai & Delhi Diagnostic Hubs',
          targetQuarter: 'Q4 2026',
          status: 'planned' as const,
          owner: 'Network Growth Team',
          progressPercent: 30,
          notes: 'Initial provider letters of intent signed with 12 lab chains.',
        },
        {
          title: 'Multi-Language Voice Assisted Symptom Navigation',
          targetQuarter: 'Q1 2027',
          status: 'planned' as const,
          owner: 'AI Research Group',
          progressPercent: 15,
          notes: 'Hindi, Kannada, and Tamil clinical dataset preparation.',
        },
      ];
      await this.milestoneModel.insertMany(defaultMilestones);
      list = await this.milestoneModel.find().sort({ targetQuarter: 1 }).exec();
    }
    return list;
  }

  async createMilestone(data: Partial<FounderMilestone>): Promise<FounderMilestone> {
    const item = new this.milestoneModel(data);
    return item.save();
  }

  async updateMilestone(id: string, update: Partial<FounderMilestone>): Promise<FounderMilestone> {
    const updated = await this.milestoneModel.findByIdAndUpdate(id, update, { new: true }).exec();
    if (!updated) throw new NotFoundException(`Milestone ${id} not found`);
    return updated;
  }

  async getRisks(): Promise<FounderRisk[]> {
    let risks = await this.riskModel.find().sort({ impact: -1 }).exec();
    if (risks.length === 0) {
      const defaultRisks = [
        {
          title: 'Clinical Boundary Policy Compliance & Safe AI Output',
          category: 'clinical_safety' as const,
          impact: 'high' as const,
          likelihood: 'low' as const,
          mitigationStrategy: 'Hardcoded guardrails, zero automated prescribing, and mandatory doctor escalation for red-flag symptoms.',
          owner: 'Dr. Sarah Jenkins (Chief Medical Officer)',
          status: 'mitigated' as const,
        },
        {
          title: 'Health Data Residency & ABDM Regulatory Updates',
          category: 'regulatory' as const,
          impact: 'high' as const,
          likelihood: 'medium' as const,
          mitigationStrategy: '100% India-local AWS/GCP data residency with encrypted field-level vault KMS.',
          owner: 'Compliance Lead',
          status: 'active' as const,
        },
        {
          title: 'External LIMS / EMR API Latency Spikes during Peak Hours',
          category: 'cybersecurity' as const,
          impact: 'medium' as const,
          likelihood: 'medium' as const,
          mitigationStrategy: 'Asynchronous BullMQ job queue with exponential backoff and circuit-breaking proxies.',
          owner: 'Infrastructure Lead',
          status: 'monitoring' as const,
        },
      ];
      await this.riskModel.insertMany(defaultRisks);
      risks = await this.riskModel.find().sort({ impact: -1 }).exec();
    }
    return risks;
  }

  async createRisk(data: Partial<FounderRisk>): Promise<FounderRisk> {
    const item = new this.riskModel(data);
    return item.save();
  }
}
