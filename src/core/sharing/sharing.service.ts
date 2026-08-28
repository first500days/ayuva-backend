import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ShareGrant, ShareGrantDocument } from './schemas/share-grant.schema';
import { ShareOrganisation, ShareOrganisationDocument } from './schemas/share-organisation.schema';
import { AccessLog, AccessLogDocument } from './schemas/access-log.schema';
import {
  CreateGrantDto,
  ShareGrantResponseDto,
  ShareOrganisationResponseDto,
  AccessLogResponseDto,
} from './dto/sharing.dto';

const DURATION_TO_MS: Record<string, number | null> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  until_revoked: null,
};

@Injectable()
export class SharingService {
  constructor(
    @InjectModel(ShareGrant.name)
    private readonly grantModel: Model<ShareGrantDocument>,
    @InjectModel(ShareOrganisation.name)
    private readonly orgModel: Model<ShareOrganisationDocument>,
    @InjectModel(AccessLog.name)
    private readonly logModel: Model<AccessLogDocument>,
  ) {}

  async listOrganisations(): Promise<ShareOrganisationResponseDto[]> {
    const orgs = await this.orgModel.find({ connected: true }).exec();
    return orgs.map((o) => ({ id: o.id, name: o.name, type: o.type, address: o.address, connected: o.connected }));
  }

  async listGrants(userId: string): Promise<ShareGrantResponseDto[]> {
    const grants = await this.grantModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ grantedAt: -1 })
      .exec();
    return grants.map((g) => this.toGrantResponse(g));
  }

  async getGrant(userId: string, id: string): Promise<ShareGrantResponseDto> {
    const grant = await this.getOwnedGrantOrThrow(userId, id);
    return this.toGrantResponse(grant);
  }

  async createGrant(userId: string, dto: CreateGrantDto): Promise<ShareGrantResponseDto> {
    const org = await this.orgModel.findById(dto.organisationId);
    const orgName = org?.name ?? dto.organisationId;

    const expiresMs = DURATION_TO_MS[dto.duration];
    const expiresAt = expiresMs ? new Date(Date.now() + expiresMs) : undefined;

    const grant = await this.grantModel.create({
      userId: new Types.ObjectId(userId),
      organisationId: dto.organisationId,
      organisationName: orgName,
      scopeKind: dto.scopeKind,
      recordIds: dto.recordIds,
      recordTitles: [],
      purpose: dto.purpose,
      duration: dto.duration,
      status: 'active',
      expiresAt,
    });

    // Log the granting action
    await this.logModel.create({
      userId: new Types.ObjectId(userId),
      grantId: grant.id,
      organisationName: orgName,
      recordTitle: `${dto.recordIds.length} record(s)`,
      action: 'granted',
    });

    return this.toGrantResponse(grant);
  }

  async revokeGrant(userId: string, id: string): Promise<ShareGrantResponseDto> {
    const grant = await this.getOwnedGrantOrThrow(userId, id);
    grant.status = 'revoked';
    grant.revokedAt = new Date();
    await grant.save();

    await this.logModel.create({
      userId: new Types.ObjectId(userId),
      grantId: id,
      organisationName: grant.organisationName,
      recordTitle: `${grant.recordIds.length} record(s)`,
      action: 'revoked',
    });

    return this.toGrantResponse(grant);
  }

  async getAccessLog(userId: string): Promise<AccessLogResponseDto[]> {
    const logs = await this.logModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ occurredAt: -1 })
      .limit(100)
      .exec();
    return logs.map((l) => ({
      id: l.id,
      grantId: l.grantId,
      organisationName: l.organisationName,
      recordTitle: l.recordTitle,
      action: l.action,
      occurredAt: (l.occurredAt ?? new Date()).toISOString(),
    }));
  }

  private async getOwnedGrantOrThrow(userId: string, id: string): Promise<ShareGrantDocument> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Grant not found');
    const grant = await this.grantModel.findOne({ _id: id, userId: new Types.ObjectId(userId) });
    if (!grant) throw new NotFoundException('Grant not found');
    return grant;
  }

  private toGrantResponse(g: ShareGrantDocument): ShareGrantResponseDto {
    return {
      id: g.id,
      organisationId: g.organisationId,
      organisationName: g.organisationName,
      scopeKind: g.scopeKind,
      recordIds: g.recordIds,
      recordTitles: g.recordTitles,
      purpose: g.purpose,
      duration: g.duration,
      status: g.status,
      grantedAt: (g.grantedAt ?? new Date()).toISOString(),
      expiresAt: g.expiresAt?.toISOString(),
      revokedAt: g.revokedAt?.toISOString(),
      accessCount: g.accessCount,
      lastAccessedAt: g.lastAccessedAt?.toISOString(),
    };
  }
}
