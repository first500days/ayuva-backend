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
