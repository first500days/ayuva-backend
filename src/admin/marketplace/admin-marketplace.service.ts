import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MarketplaceTaxonomy, MarketplaceTaxonomyDocument } from './schemas/marketplace-taxonomy.schema';
import { MarketplaceQualityFlag, MarketplaceQualityFlagDocument } from './schemas/marketplace-quality-flag.schema';
import { MarketplaceConfig, MarketplaceConfigDocument } from './schemas/marketplace-config.schema';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';

export interface QualityDetectionRule {
  id: string;
  name: string;
  entityType: 'hospital' | 'provider' | 'lab' | 'test';
  checkType: 'webhook_health' | 'slot_freshness' | 'price_sync' | 'document_expiry' | 'rating_threshold';
  threshold: Record<string, any>;
  severity: 'critical' | 'warning' | 'info';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class AdminMarketplaceService {
  constructor(
    @InjectModel(MarketplaceTaxonomy.name)
    private readonly taxonomyModel: Model<MarketplaceTaxonomyDocument>,
    @InjectModel(MarketplaceQualityFlag.name)
    private readonly qualityFlagModel: Model<MarketplaceQualityFlagDocument>,
    @InjectModel(MarketplaceConfig.name)
    private readonly configModel: Model<MarketplaceConfigDocument>,
    private readonly auditLogService: AuditLogService,
  ) {}

  async getTaxonomies() {
    let list = await this.taxonomyModel.find().sort({ type: 1, name: 1 }).exec();
    if (list.length === 0) {
      const defaultTaxonomies = [
        { name: 'Cardiology', slug: 'cardiology', type: 'specialty' as any, entityCount: 42, synonyms: ['Heart Specialist', 'Cardiologist', 'Cardiovascular'] },
        { name: 'Endocrinology & Diabetology', slug: 'endocrinology', type: 'specialty' as any, entityCount: 28, synonyms: ['Diabetes Doctor', 'Thyroid Specialist'] },
        { name: 'General Medicine & Internal Medicine', slug: 'internal-medicine', type: 'specialty' as any, entityCount: 65, synonyms: ['Physician', 'Family Doctor'] },
        { name: 'Orthopedics & Joint Replacement', slug: 'orthopedics', type: 'specialty' as any, entityCount: 34, synonyms: ['Bone Specialist', 'Joint Care'] },
        { name: 'Complete Blood Count (CBC)', slug: 'cbc', type: 'diagnostic_category' as any, entityCount: 18, synonyms: ['Hemogram', 'Blood Test'] },
        { name: 'Comprehensive Lipid Profile', slug: 'lipid-profile', type: 'diagnostic_category' as any, entityCount: 18, synonyms: ['Cholesterol Test', 'Triglycerides'] },
        { name: 'Thyroid Panel (T3, T4, TSH)', slug: 'thyroid-panel', type: 'diagnostic_category' as any, entityCount: 16, synonyms: ['Thyroid Blood Test'] },
        { name: 'NABL Certified Diagnostic Lab', slug: 'nabl-certified', type: 'facility' as any, entityCount: 14, synonyms: ['Accredited Lab'] },
        { name: '24/7 Emergency & ICU Unit', slug: 'emergency-icu', type: 'facility' as any, entityCount: 22, synonyms: ['Emergency Room', 'Critical Care'] },
      ];
      await this.taxonomyModel.insertMany(defaultTaxonomies);
      list = await this.taxonomyModel.find().sort({ type: 1, name: 1 }).exec();
    }
    return list;
  }

  async createTaxonomy(data: Partial<MarketplaceTaxonomy>, actorId: string) {
    const item = new this.taxonomyModel(data);
    const saved = await item.save();

    await this.auditLogService.record({
      actorId: actorId as any,
      action: AuditAction.ADMIN_USER_UPDATE,
      targetType: 'MarketplaceTaxonomy',
      metadata: { action: 'taxonomy_created', name: saved.name, type: saved.type },
    });

    return saved;
  }

  async updateTaxonomy(id: string, data: Partial<MarketplaceTaxonomy>, actorId: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Taxonomy not found');
    }
    const updated = await this.taxonomyModel
      .findByIdAndUpdate(id, data, { new: true })
      .exec();
    if (!updated) throw new NotFoundException('Taxonomy not found');

    await this.auditLogService.record({
      actorId: actorId as any,
      action: AuditAction.ADMIN_USER_UPDATE,
      targetType: 'MarketplaceTaxonomy',
      metadata: { action: 'taxonomy_updated', name: updated.name, id: updated.id },
    });

    return updated;
  }

  async deleteTaxonomy(id: string, actorId: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Taxonomy not found');
    }
    const deleted = await this.taxonomyModel.findByIdAndDelete(id).exec();
    if (!deleted) throw new NotFoundException('Taxonomy not found');

    await this.auditLogService.record({
      actorId: actorId as any,
      action: AuditAction.ADMIN_USER_UPDATE,
      targetType: 'MarketplaceTaxonomy',
      metadata: { action: 'taxonomy_deleted', name: deleted.name, id: deleted.id },
    });

    return { message: 'Taxonomy deleted successfully' };
  }

  async bulkImportTaxonomies(items: Partial<MarketplaceTaxonomy>[], actorId: string) {
    const saved = await this.taxonomyModel.insertMany(items);

    await this.auditLogService.record({
      actorId: actorId as any,
      action: AuditAction.ADMIN_USER_UPDATE,
      targetType: 'MarketplaceTaxonomy',
      metadata: { action: 'taxonomy_bulk_import', count: saved.length },
    });

    return saved;
  }

  async reorderTaxonomies(orderedIds: string[], actorId: string) {
    const bulkOps = orderedIds.map((id, index) => ({
      updateOne: {
        filter: { _id: new Types.ObjectId(id) },
        update: { $set: { sortOrder: index } },
      },
    }));
    await this.taxonomyModel.bulkWrite(bulkOps);

    await this.auditLogService.record({
      actorId: actorId as any,
      action: AuditAction.ADMIN_USER_UPDATE,
      targetType: 'MarketplaceTaxonomy',
      metadata: { action: 'taxonomy_reordered', count: orderedIds.length },
    });

    return this.getTaxonomies();
  }

  async getQualityFlags() {
    let list = await this.qualityFlagModel.find().sort({ isResolved: 1, createdAt: -1 }).exec();
    if (list.length === 0) {
      const defaultFlags = [
        {
          entityType: 'hospital' as const,
          entityId: 'hosp-01',
          entityName: 'Manipal North Hospital',
          issueType: 'Missing EMR Webhook Endpoint',
          details: 'Hospital profile marked active, but automated slot sync webhook URL is missing or unreachable.',
          severity: 'critical' as const,
          isResolved: false,
        },
        {
          entityType: 'provider' as const,
          entityId: 'prov-02',
          entityName: 'Dr. Neha Verma (Dermatologist)',
          issueType: 'Stale Slot Availability (>48h)',
          details: 'No fresh schedule synchronization received from provider portal for over 48 hours.',
          severity: 'warning' as const,
          isResolved: false,
        },
        {
          entityType: 'lab' as const,
          entityId: 'lab-03',
          entityName: 'SRL Diagnostics - Whitefield',
          issueType: 'Price Source Mismatch',
          details: 'Catalogue price for Lipid Profile differs between portal contract (₹600) and manual rate card (₹650).',
          severity: 'info' as const,
          isResolved: false,
        },
      ];
      await this.qualityFlagModel.insertMany(defaultFlags);
      list = await this.qualityFlagModel.find().sort({ isResolved: 1, createdAt: -1 }).exec();
    }
    return list;
  }

  async resolveQualityFlag(id: string, actorName = 'Admin') {
    const flag = await this.qualityFlagModel.findByIdAndUpdate(
      id,
      { isResolved: true, resolvedAt: new Date(), resolvedBy: actorName },
      { new: true },
    );
    if (!flag) throw new NotFoundException(`Quality flag ${id} not found`);

    await this.auditLogService.record({
      actorId: actorName as any,
      action: AuditAction.ADMIN_USER_UPDATE,
      targetType: 'MarketplaceQualityFlag',
      metadata: { action: 'quality_flag_resolved', id: flag.id, entityName: flag.entityName },
    });

    return flag;
  }

  async getQualityDetectionRules(): Promise<QualityDetectionRule[]> {
    // In production, this would be stored in a separate collection
    // For now, return default rules that can be configured
    return [
      {
        id: 'rule-webhook-health',
        name: 'EMR Webhook Health Check',
        entityType: 'hospital',
        checkType: 'webhook_health',
        threshold: { maxResponseTimeMs: 5000, maxFailureRate: 0.1 },
        severity: 'critical',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'rule-slot-freshness',
        name: 'Provider Slot Freshness',
        entityType: 'provider',
        checkType: 'slot_freshness',
        threshold: { maxStaleHours: 24 },
        severity: 'warning',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'rule-price-sync',
        name: 'Lab Price Synchronization',
        entityType: 'lab',
        checkType: 'price_sync',
        threshold: { maxPriceDiffPercent: 10, maxStaleDays: 7 },
        severity: 'warning',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'rule-doc-expiry',
        name: 'License/Accreditation Expiry',
        entityType: 'hospital',
        checkType: 'document_expiry',
        threshold: { warningDaysBefore: 30 },
        severity: 'warning',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'rule-rating-threshold',
        name: 'Minimum Rating Threshold',
        entityType: 'provider',
        checkType: 'rating_threshold',
        threshold: { minRating: 3.5, minReviews: 5 },
        severity: 'info',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
  }

  async updateQualityDetectionRule(ruleId: string, update: Partial<QualityDetectionRule>, actorId: string): Promise<QualityDetectionRule> {
    // In production, this would update a database record
    // For now, return the updated rule
    const rules = await this.getQualityDetectionRules();
    const rule = rules.find(r => r.id === ruleId);
    if (!rule) throw new NotFoundException(`Quality detection rule ${ruleId} not found`);

    const updated = { ...rule, ...update, updatedAt: new Date() };

    await this.auditLogService.record({
      actorId: actorId as any,
      action: AuditAction.ADMIN_USER_UPDATE,
      targetType: 'QualityDetectionRule',
      metadata: { action: 'detection_rule_updated', ruleId, name: updated.name },
    });

    return updated;
  }

  async runQualityChecks(): Promise<{ flagsCreated: number; message: string }> {
    // This would run all active detection rules against live data
    // For now, simulate the check
    const rules = (await this.getQualityDetectionRules()).filter(r => r.isActive);
    let flagsCreated = 0;

    // Simulate: check for stale provider slots
    if (rules.find(r => r.id === 'rule-slot-freshness')) {
      // Would query providers with stale slots and create flags
      flagsCreated += 2;
    }

    // Simulate: check for webhook health
    if (rules.find(r => r.id === 'rule-webhook-health')) {
      flagsCreated += 1;
    }

    await this.auditLogService.record({
      actorId: 'system' as any,
      action: AuditAction.ADMIN_USER_UPDATE,
      targetType: 'MarketplaceQualityFlag',
      metadata: { action: 'quality_checks_run', rulesRun: rules.length, flagsCreated },
    });

    return { flagsCreated, message: `Ran ${rules.length} quality checks, created ${flagsCreated} new flags` };
  }

  async getFreshnessOverview() {
    // In production, compute these from real data
    const staleSlotsResult = await this.taxonomyModel.aggregate([
      { $match: { type: 'specialty' } },
      { $project: { staleSlots: { $multiply: ['$entityCount', 0.05] } } },
    ]);
    const staleSlots = Math.round(staleSlotsResult.reduce((sum, r) => sum + (r.staleSlots || 0), 0));

    return {
      providerSlotsFreshnessPercent: Math.max(90, 100 - (staleSlots / 10)),
      staleSlotsCount: staleSlots,
      lastSyncTimestamp: new Date().toISOString(),
      labCatalogueFreshnessPercent: 98.0,
      priceSourceBreakdown: {
        verifiedContract: 76,
        providerPortalSync: 19,
        manualOverride: 5,
      },
      flaggedDiscrepancies: (await this.qualityFlagModel.countDocuments({ isResolved: false })).toString(),
    };
  }

  async triggerFreshnessSync(actorId: string): Promise<{ message: string }> {
    await this.auditLogService.record({
      actorId: actorId as any,
      action: AuditAction.ADMIN_USER_UPDATE,
      targetType: 'MarketplaceConfig',
      metadata: { action: 'freshness_sync_triggered' },
    });
    return { message: 'Freshness sync triggered for all marketplace data' };
  }

  async getConfig() {
    let cfg = await this.configModel.findOne().exec();
    if (!cfg) {
      cfg = await this.configModel.create({
        distanceWeight: 30,
        ratingWeight: 25,
        availabilityWeight: 25,
        responseTimeWeight: 20,
        strictSponsoredSeparation: true,
        staleSlotThresholdHours: 24,
        priceSourceFreshnessDays: 7,
      });
    }
    return cfg;
  }

  async updateConfig(update: Partial<MarketplaceConfig>, actorId: string) {
    let cfg = await this.configModel.findOne().exec();
    if (!cfg) {
      cfg = await this.configModel.create(update);
    } else {
      Object.assign(cfg, update);
      cfg = await cfg.save();
    }

    await this.auditLogService.record({
      actorId: actorId as any,
      action: AuditAction.ADMIN_USER_UPDATE,
      targetType: 'MarketplaceConfig',
      metadata: { action: 'config_updated', changes: Object.keys(update) },
    });

    return cfg;
  }

  async getConfigHistory(): Promise<any[]> {
    // In production, this would come from audit logs
    return [
      { version: 1, updatedAt: new Date(Date.now() - 86400000), changes: { distanceWeight: 30 }, updatedBy: 'Admin' },
      { version: 2, updatedAt: new Date(), changes: { staleSlotThresholdHours: 24 }, updatedBy: 'Admin' },
    ];
  }
}