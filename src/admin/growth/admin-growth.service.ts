import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GrowthCampaign, GrowthCampaignDocument, CampaignStatus } from './schemas/growth-campaign.schema';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';

@Injectable()
export class AdminGrowthService {
  constructor(
    @InjectModel(GrowthCampaign.name)
    private readonly campaignModel: Model<GrowthCampaignDocument>,
    private readonly auditLogService: AuditLogService,
  ) {}

  async findAll(status?: CampaignStatus): Promise<GrowthCampaign[]> {
    let campaigns = await this.campaignModel.find().exec();
    if (campaigns.length === 0) {
      const defaultCampaigns = [
        {
          title: 'Ayuva Annual Wellness Executive Checkup Drive',
          sponsorName: 'Apollo Health Checkups',
          placement: 'marketplace_banner',
          status: CampaignStatus.ACTIVE,
          startDate: '2026-08-01',
          endDate: '2026-09-30',
          budget: 75000,
          spent: 32400,
          headline: 'Comprehensive 72-Parameter Master Health Checkup at 40% Off',
          subtext: 'Includes full body vitals, cardiac markers, lipid panel, and consultation with senior physician.',
          ctaText: 'Book Checkup Now',
          ctaUrl: '/marketplace/packages/master-health',
          imageUrl: 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?w=800&auto=format&fit=crop',
          targetSpecialties: ['Preventive Healthcare', 'Cardiology'],
          targetLocations: ['Bangalore', 'Mumbai'],
          sponsoredBadgeVisible: true,
          impressions: 48200,
          clicks: 3410,
          conversions: 248,
          revenueGenerated: 496000,
          approvedBy: 'Growth Admin',
          approvedAt: new Date('2026-08-01T09:00:00Z'),
        },
        {
          title: 'Metropolis Home Blood Collection Campaign',
          sponsorName: 'Metropolis Diagnostics',
          placement: 'user_app',
          status: CampaignStatus.ACTIVE,
          startDate: '2026-08-10',
          endDate: '2026-09-15',
          budget: 50000,
          spent: 18200,
          headline: 'Certified Phlebotomist at Your Doorstep in 60 Minutes',
          subtext: 'Book routine or fasting diagnostic tests from home with zero convenience fees this month.',
          ctaText: 'Schedule Home Visit',
          ctaUrl: '/labs/home-collection',
          imageUrl: 'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=800&auto=format&fit=crop',
          targetSpecialties: ['Diagnostics', 'Diabetes'],
          targetLocations: ['Bangalore', 'Delhi NCR'],
          sponsoredBadgeVisible: true,
          impressions: 32100,
          clicks: 2190,
          conversions: 184,
          revenueGenerated: 276000,
          approvedBy: 'Growth Admin',
          approvedAt: new Date('2026-08-10T10:00:00Z'),
        },
        {
          title: 'Monsoon Preventive Immunity & Dengue Screening',
          sponsorName: 'Dr. Lal PathLabs',
          placement: 'public_website',
          status: CampaignStatus.SCHEDULED,
          startDate: '2026-09-01',
          endDate: '2026-10-15',
          budget: 40000,
          spent: 0,
          headline: 'Rapid Fever & Platelet Screening Panel',
          subtext: 'Fast 4-hour electronic report delivery for seasonal fever and viral diagnostic panels.',
          ctaText: 'View Package',
          ctaUrl: '/labs/dengue-panel',
          imageUrl: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800&auto=format&fit=crop',
          targetSpecialties: ['Infectious Diseases', 'General Medicine'],
          targetLocations: ['Mumbai', 'Bangalore'],
          sponsoredBadgeVisible: true,
          impressions: 0,
          clicks: 0,
          conversions: 0,
          revenueGenerated: 0,
        },
      ];
      await this.campaignModel.insertMany(defaultCampaigns);
    }

    const filter = status ? { status } : {};
    return this.campaignModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string): Promise<GrowthCampaign> {
    const item = await this.campaignModel.findById(id).exec();
    if (!item) throw new NotFoundException(`Campaign ${id} not found`);
    return item;
  }

  async create(data: Partial<GrowthCampaign>, actorId: string): Promise<GrowthCampaign> {
    const campaign = new this.campaignModel({
      ...data,
      sponsoredBadgeVisible: true, // enforced trust guardrail
      status: CampaignStatus.DRAFT,
    });
    const saved = await campaign.save();

    await this.auditLogService.record({
      actorId: actorId as any,
      action: AuditAction.ADMIN_USER_CREATE,
      targetType: 'GrowthCampaign',
      targetId: saved._id as any,
      metadata: { title: saved.title, sponsor: saved.sponsorName },
    });

    return saved;
  }

  async update(id: string, update: Partial<GrowthCampaign>, actorId: string): Promise<GrowthCampaign> {
    update.sponsoredBadgeVisible = true; // enforced trust guardrail
    const updated = await this.campaignModel.findByIdAndUpdate(id, update, { new: true }).exec();
    if (!updated) throw new NotFoundException(`Campaign ${id} not found`);

    await this.auditLogService.record({
      actorId: actorId as any,
      action: AuditAction.ADMIN_USER_UPDATE,
      targetType: 'GrowthCampaign',
      targetId: updated._id as any,
      metadata: { action: 'campaign_updated', title: updated.title },
    });

    return updated;
  }

  async updateStatus(id: string, status: CampaignStatus, actorId: string, actorName = 'Growth Admin'): Promise<GrowthCampaign> {
    const updateObj: Record<string, any> = { status };
    if (status === CampaignStatus.ACTIVE) {
      updateObj.approvedBy = actorName;
      updateObj.approvedAt = new Date();
    }
    const updated = await this.campaignModel.findByIdAndUpdate(id, updateObj, { new: true }).exec();
    if (!updated) throw new NotFoundException(`Campaign ${id} not found`);

    await this.auditLogService.record({
      actorId: actorId as any,
      action: AuditAction.ADMIN_USER_UPDATE,
      targetType: 'GrowthCampaign',
      targetId: updated._id as any,
      metadata: { action: `campaign_status_${status}`, status },
    });

    return updated;
  }

  async getOverview() {
    const campaigns = await this.campaignModel.find().exec();
    const active = campaigns.filter((c) => c.status === CampaignStatus.ACTIVE);
    const totalImpressions = campaigns.reduce((acc, c) => acc + (c.impressions || 0), 0);
    const totalClicks = campaigns.reduce((acc, c) => acc + (c.clicks || 0), 0);
    const totalRevenue = campaigns.reduce((acc, c) => acc + (c.revenueGenerated || 0), 0);
    const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

    return {
      activeCampaignsCount: active.length,
      totalImpressions,
      totalClicks,
      avgCtr: parseFloat(avgCtr.toFixed(2)),
      totalRevenueGenerated: totalRevenue,
      placementsBreakdown: {
        publicWebsite: campaigns.filter((c) => c.placement === 'public_website').length,
        userApp: campaigns.filter((c) => c.placement === 'user_app').length,
        marketplaceBanner: campaigns.filter((c) => c.placement === 'marketplace_banner').length,
      },
    };
  }
}
