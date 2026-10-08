import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Provider,
  ProviderDocument,
  ProviderStatus,
} from '../core/providers/schemas/provider.schema';
import { User, UserDocument } from '../core/users/schemas/user.schema';
import {
  MemberStatus,
  PartnerMember,
  PartnerMemberDocument,
} from './staff/schemas/partner-member.schema';
import {
  OrgType,
  Perm,
  StaffRole,
  orgTypeOf,
  permissionsFor,
} from './rbac/partner-permissions';

const LIVE_STATUSES = [ProviderStatus.ACTIVE, ProviderStatus.VERIFIED];

// lastActiveAt is for the roster's "last seen" — minute-level precision is plenty.
const ACTIVITY_WRITE_INTERVAL_MS = 5 * 60 * 1000;

/** Who is acting, for which organisation, with what they're allowed to do. */
export interface PartnerContext {
  provider: ProviderDocument;
  member: PartnerMemberDocument;
  orgType: OrgType;
  role: StaffRole;
  permissions: Perm[];
}

/**
 * Resolves the organisation (Provider) an authenticated partner login acts
 * for — as its owner or as invited staff — and enforces the verification
 * gate (P01) and membership status.
 */
@Injectable()
export class PartnerContextService {
  constructor(
    @InjectModel(Provider.name)
    private readonly providerModel: Model<ProviderDocument>,
    @InjectModel(PartnerMember.name)
    private readonly memberModel: Model<PartnerMemberDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  /** Context regardless of verification state (onboarding/status screens). */
  async resolve(userId: string): Promise<PartnerContext> {
    const member = await this.findOrCreateMembership(userId);
    if (member.status === MemberStatus.SUSPENDED) {
      throw new ForbiddenException(
        'Your access to this organisation has been suspended',
      );
    }
    if (member.status === MemberStatus.INVITED) {
      throw new ForbiddenException(
        'Accept your invitation to join this organisation first',
      );
    }
    const provider = await this.providerModel.findById(member.providerId);
    if (!provider)
      throw new NotFoundException(
        'No provider profile is linked to this account',
      );

    this.touch(member);
    const orgType = orgTypeOf(provider.type);
    return {
      provider,
      member,
      orgType,
      role: member.role,
      permissions: permissionsFor(orgType, member.role),
    };
  }

  /** Context only once an admin has verified the organisation. */
  async requireLiveContext(userId: string): Promise<PartnerContext> {
    const ctx = await this.resolve(userId);
    if (!LIVE_STATUSES.includes(ctx.provider.status)) {
      throw new ForbiddenException(
        `Your account is ${ctx.provider.status.replace('_', ' ')} — it goes live once Ayuva verifies it`,
      );
    }
    return ctx;
  }

  /** Provider for this partner regardless of verification state (used for onboarding/status screens). */
  async getProvider(userId: string): Promise<ProviderDocument> {
    return (await this.resolve(userId)).provider;
  }

  /** Provider for this partner, only once an admin has verified the account. */
  async requireLive(userId: string): Promise<ProviderDocument> {
    return (await this.requireLiveContext(userId)).provider;
  }

  /** Active members of an organisation — recipients, roster, audit scoping. */
  activeMembers(
    providerId: Types.ObjectId | string,
  ): Promise<PartnerMemberDocument[]> {
    return this.memberModel
      .find({
        providerId: new Types.ObjectId(providerId),
        status: MemberStatus.ACTIVE,
      })
      .exec();
  }

  /** Every login that has ever belonged to the organisation (audit must cover ex-staff too). */
  async allMemberUserIds(
    providerId: Types.ObjectId | string,
  ): Promise<Types.ObjectId[]> {
    const members = await this.memberModel
      .find({ providerId: new Types.ObjectId(providerId) })
      .select('userId')
      .lean()
      .exec();
    return members.map((m) => m.userId);
  }

  /**
   * Owners registered before staff management existed have no membership
   * row yet; create it on first use so every login resolves the same way.
   */
  private async findOrCreateMembership(
    userId: string,
  ): Promise<PartnerMemberDocument> {
    const uid = new Types.ObjectId(userId);
    const existing = await this.memberModel.findOne({ userId: uid });
    if (existing) return existing;

    const provider = await this.providerModel.findOne({ ownerUserId: uid });
    if (!provider)
      throw new NotFoundException(
        'No provider profile is linked to this account',
      );
    const user = await this.userModel
      .findById(uid)
      .select('fullName email')
      .exec();
    try {
      return await this.memberModel.create({
        providerId: provider._id,
        userId: uid,
        role: StaffRole.ADMIN,
        isOwner: true,
        status: MemberStatus.ACTIVE,
        fullName: user?.fullName ?? provider.name,
        email: user?.email ?? provider.email ?? 'unknown@ayuva.local',
        phone: provider.phone,
        registrationNumber: provider.registrationNumber,
        joinedAt: new Date(),
      });
    } catch (err) {
      // Two first requests racing: the unique userId index lets exactly one create win.
      const raced = await this.memberModel.findOne({ userId: uid });
      if (raced) return raced;
      throw err;
    }
  }

  private touch(member: PartnerMemberDocument) {
    const last = member.lastActiveAt?.getTime() ?? 0;
    if (Date.now() - last < ACTIVITY_WRITE_INTERVAL_MS) return;
    void this.memberModel
      .updateOne({ _id: member._id }, { $set: { lastActiveAt: new Date() } })
      .exec()
      .catch(() => undefined);
  }
}
