import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Provider,
  ProviderDocument,
  ProviderStatus,
} from '../core/providers/schemas/provider.schema';

const LIVE_STATUSES = [ProviderStatus.ACTIVE, ProviderStatus.VERIFIED];

/** Resolves the provider profile owned by the authenticated partner and enforces the verification gate (P01). */
@Injectable()
export class PartnerContextService {
  constructor(
    @InjectModel(Provider.name)
    private readonly providerModel: Model<ProviderDocument>,
  ) {}

  /** Provider for this partner regardless of verification state (used for onboarding/status screens). */
  async getProvider(userId: string): Promise<ProviderDocument> {
    const provider = await this.providerModel.findOne({
      ownerUserId: new Types.ObjectId(userId),
    });
    if (!provider) throw new NotFoundException('No provider profile is linked to this account');
    return provider;
  }

  /** Provider for this partner, only once an admin has verified the account. */
  async requireLive(userId: string): Promise<ProviderDocument> {
    const provider = await this.getProvider(userId);
    if (!LIVE_STATUSES.includes(provider.status)) {
      throw new ForbiddenException(
        `Your account is ${provider.status.replace('_', ' ')} — it goes live once Ayuva verifies it`,
      );
    }
    return provider;
  }
}
