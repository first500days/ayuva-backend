import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MarketplaceTaxonomy, MarketplaceTaxonomyDocument } from './schemas/marketplace-taxonomy.schema';
import { MarketplaceQualityFlag, MarketplaceQualityFlagDocument } from './schemas/marketplace-quality-flag.schema';
import { MarketplaceConfig, MarketplaceConfigDocument } from './schemas/marketplace-config.schema';

@Injectable()
export class AdminMarketplaceService {
  constructor(
    @InjectModel(MarketplaceTaxonomy.name)
    private readonly taxonomyModel: Model<MarketplaceTaxonomyDocument>,
    @InjectModel(MarketplaceQualityFlag.name)
    private readonly qualityFlagModel: Model<MarketplaceQualityFlagDocument>,
    @InjectModel(MarketplaceConfig.name)
    private readonly configModel: Model<MarketplaceConfigDocument>,
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

  async createTaxonomy(data: Partial<MarketplaceTaxonomy>) {
    const item = new this.taxonomyModel(data);
    return item.save();
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
    return flag;
  }

  async getFreshnessOverview() {
    return {
      providerSlotsFreshnessPercent: 94.2,
      staleSlotsCount: 12,
      lastSyncTimestamp: new Date().toISOString(),
      labCatalogueFreshnessPercent: 98.0,
      priceSourceBreakdown: {
        verifiedContract: 76,
        providerPortalSync: 19,
        manualOverride: 5,
      },
      flaggedDiscrepancies: 3,
    };
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

  async updateConfig(update: Partial<MarketplaceConfig>) {
    let cfg = await this.configModel.findOne().exec();
    if (!cfg) {
      cfg = await this.configModel.create(update);
    } else {
      Object.assign(cfg, update);
      cfg = await cfg.save();
    }
    return cfg;
  }
}
