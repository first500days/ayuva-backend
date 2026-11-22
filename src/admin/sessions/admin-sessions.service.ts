import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import { TokenRevocationService } from '../../auth/services/token-revocation.service';
import {
  Provider,
  ProviderDocument,
} from '../../core/providers/schemas/provider.schema';
import {
  PartnerMember,
  PartnerMemberDocument,
} from '../../partner/staff/schemas/partner-member.schema';
import { User, UserDocument } from '../../core/users/schemas/user.schema';

/**
 * Session revocation from the Admin Panel's master grids: one login (Patient
 * Support grid), or every staff login of one partner organisation (Doctors &
 * Providers grid). Every web and app token they hold stops working at once
 * and their live screens close; the action is sealed into the audit trail.
 */
@Injectable()
export class AdminSessionsService {
  constructor(
    @InjectModel(PartnerMember.name)
    private readonly memberModel: Model<PartnerMemberDocument>,
    @InjectModel(Provider.name)
    private readonly providerModel: Model<ProviderDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly revocation: TokenRevocationService,
    private readonly audit: AuditLogService,
  ) {}

  async endUser(adminId: string, userId: string, reason: string) {
    if (!Types.ObjectId.isValid(userId))
      throw new BadRequestException('Unknown user');
    if (adminId === userId)
      throw new BadRequestException('Use Sign out to end your own session');
    const ended = await this.revocation.revoke([userId]);
    await this.audit.record({
      actorId: adminId,
      action: AuditAction.SESSIONS_TERMINATED,
      targetType: 'User',
      targetId: userId,
      metadata: { reason, scope: 'user', logins: ended },
    });
    return { logins: ended, at: new Date().toISOString() };
  }

  /**
   * Facility kill-switch: locks a whole partner organisation (hospital, lab,
   * clinic). Every staff token is refused from this moment on every server
   * (the lock is checked on each request, not only at expiry), live screens
   * close, and no new sign-in or refresh is allowed until it is unlocked.
   */
  async lockOrganisation(adminId: string, providerId: string, reason: string) {
    const provider = await this.findProvider(providerId);
    const at = new Date();
    await this.providerModel.updateOne(
      { _id: provider._id },
      { $set: { lockedAt: at, lockReason: reason } },
    );
    const userIds = await this.staffIds(providerId, adminId);
    await this.userModel.updateMany(
      { _id: { $in: userIds.map((id) => new Types.ObjectId(id)) } },
      { $set: { facilityLockedAt: at } },
    );
    const ended = await this.revocation.revoke(userIds);
    await this.audit.record({
      actorId: adminId,
      action: AuditAction.FACILITY_LOCKED,
      targetType: 'Provider',
      targetId: providerId,
      metadata: { reason, organisation: provider.name, logins: ended },
    });
    return { lockedAt: at.toISOString(), logins: ended };
  }

  async unlockOrganisation(
    adminId: string,
    providerId: string,
    reason: string,
  ) {
    const provider = await this.findProvider(providerId);
    await this.providerModel.updateOne(
      { _id: provider._id },
      { $unset: { lockedAt: 1, lockReason: 1 } },
    );
    const userIds = await this.staffIds(providerId);
    await this.userModel.updateMany(
      { _id: { $in: userIds.map((id) => new Types.ObjectId(id)) } },
      { $unset: { facilityLockedAt: 1 } },
    );
    await this.audit.record({
      actorId: adminId,
      action: AuditAction.FACILITY_UNLOCKED,
      targetType: 'Provider',
      targetId: providerId,
      metadata: { reason, organisation: provider.name },
    });
    return { unlocked: true, at: new Date().toISOString() };
  }

  private async findProvider(providerId: string) {
    if (!Types.ObjectId.isValid(providerId))
      throw new NotFoundException('Provider not found');
    const provider = await this.providerModel
      .findById(providerId)
      .select('name')
      .lean()
      .exec();
    if (!provider) throw new NotFoundException('Provider not found');
    return provider;
  }

  private async staffIds(providerId: string, exceptId?: string) {
    const members = await this.memberModel
      .find({ providerId: new Types.ObjectId(providerId) })
      .select('userId')
      .lean()
      .exec();
    return members
      .map((m) => m.userId.toString())
      .filter((id) => id !== exceptId);
  }

  async endOrganisation(adminId: string, providerId: string, reason: string) {
    if (!Types.ObjectId.isValid(providerId))
      throw new NotFoundException('Provider not found');
    const provider = await this.providerModel
      .findById(providerId)
      .select('name')
      .lean()
      .exec();
    if (!provider) throw new NotFoundException('Provider not found');
    const members = await this.memberModel
      .find({ providerId: new Types.ObjectId(providerId) })
      .select('userId')
      .lean()
      .exec();
    const userIds = members
      .map((m) => m.userId.toString())
      .filter((id) => id !== adminId);
    const ended = await this.revocation.revoke(userIds);
    await this.audit.record({
      actorId: adminId,
      action: AuditAction.SESSIONS_TERMINATED,
      targetType: 'Provider',
      targetId: providerId,
      metadata: {
        reason,
        scope: 'organisation',
        organisation: provider.name,
        logins: ended,
      },
    });
    return { logins: ended, at: new Date().toISOString() };
  }
}
