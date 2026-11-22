import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import {
  User,
  UserDocument,
  UserRole,
  UserStatus,
} from '../users/schemas/user.schema';
import {
  FamilyAccess,
  FamilyAccessDocument,
  type FamilyAccessLevel,
} from './schemas/family-access.schema';

/**
 * Permission levels on family profiles. The guardian who created a profile
 * can give another AYUVA account access to it, view only or able to act for
 * it (book, cancel, upload, share). The server enforces the level whenever
 * that account switches to the profile (JwtStrategy).
 */
@Injectable()
export class FamilyAccessService {
  constructor(
    @InjectModel(FamilyAccess.name)
    private readonly accessModel: Model<FamilyAccessDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly audit: AuditLogService,
  ) {}

  private async ownedProfile(guardianId: string, profileId: string) {
    if (!Types.ObjectId.isValid(profileId))
      throw new NotFoundException('Family member not found');
    const member = await this.userModel
      .findOne({
        _id: profileId,
        managedBy: new Types.ObjectId(guardianId),
        status: UserStatus.ACTIVE,
      })
      .select('fullName')
      .lean()
      .exec();
    if (!member) throw new NotFoundException('Family member not found');
    return member;
  }

  async list(guardianId: string, profileId: string) {
    await this.ownedProfile(guardianId, profileId);
    const rows = await this.accessModel
      .find({ profileId: new Types.ObjectId(profileId) })
      .lean()
      .exec();
    const users = await this.userModel
      .find({ _id: { $in: rows.map((r) => r.userId) } })
      .select('fullName email')
      .lean()
      .exec();
    const byId = new Map(users.map((u) => [u._id.toString(), u]));
    return rows.map((r) => ({
      id: r._id.toString(),
      userId: r.userId.toString(),
      name: byId.get(r.userId.toString())?.fullName ?? 'AYUVA user',
      email: byId.get(r.userId.toString())?.email ?? null,
      level: r.level,
    }));
  }

  async grant(
    guardianId: string,
    profileId: string,
    email: string,
    level: FamilyAccessLevel,
  ) {
    const member = await this.ownedProfile(guardianId, profileId);
    const person = await this.userModel
      .findOne({
        email: email.trim().toLowerCase(),
        role: UserRole.PATIENT,
        status: UserStatus.ACTIVE,
      })
      .select('fullName managedBy')
      .lean()
      .exec();
    // Don't reveal whether an address has an account beyond what's needed to proceed.
    if (!person || person.managedBy)
      throw new BadRequestException(
        'No AYUVA account uses that email. Ask them to sign up first.',
      );
    if (person._id.toString() === guardianId)
      throw new BadRequestException('You already manage this profile');
    await this.accessModel
      .updateOne(
        { profileId: member._id, userId: person._id },
        { $set: { level, grantedBy: new Types.ObjectId(guardianId) } },
        { upsert: true },
      )
      .exec();
    await this.audit.record({
      actorId: guardianId,
      action: AuditAction.FAMILY_PERMISSIONS_UPDATE,
      targetType: 'User',
      targetId: member._id.toString(),
      metadata: { granteeId: person._id.toString(), level, change: 'granted' },
    });
    return (await this.list(guardianId, profileId)).find(
      (r) => r.userId === person._id.toString(),
    )!;
  }

  async setLevel(
    guardianId: string,
    profileId: string,
    accessId: string,
    level: FamilyAccessLevel,
  ) {
    await this.ownedProfile(guardianId, profileId);
    const res = await this.accessModel
      .updateOne(
        { _id: accessId, profileId: new Types.ObjectId(profileId) },
        { $set: { level } },
      )
      .exec();
    if (!res.matchedCount) throw new NotFoundException('Access not found');
    await this.audit.record({
      actorId: guardianId,
      action: AuditAction.FAMILY_PERMISSIONS_UPDATE,
      targetType: 'User',
      targetId: profileId,
      metadata: { accessId, level, change: 'level' },
    });
    return { id: accessId, level };
  }

  async revoke(guardianId: string, profileId: string, accessId: string) {
    await this.ownedProfile(guardianId, profileId);
    const res = await this.accessModel
      .deleteOne({ _id: accessId, profileId: new Types.ObjectId(profileId) })
      .exec();
    if (!res.deletedCount) throw new NotFoundException('Access not found');
    await this.audit.record({
      actorId: guardianId,
      action: AuditAction.FAMILY_PERMISSIONS_UPDATE,
      targetType: 'User',
      targetId: profileId,
      metadata: { accessId, change: 'revoked' },
    });
    return { removed: true };
  }

  /** Profiles other guardians gave this account access to, with the level. */
  async sharedWith(userId: string) {
    const rows = await this.accessModel
      .find({ userId: new Types.ObjectId(userId) })
      .lean()
      .exec();
    if (!rows.length) return [];
    const members = await this.userModel
      .find({
        _id: { $in: rows.map((r) => r.profileId) },
        status: UserStatus.ACTIVE,
      })
      .select('fullName relation')
      .lean()
      .exec();
    const byId = new Map(members.map((m) => [m._id.toString(), m]));
    return rows.flatMap((r) => {
      const m = byId.get(r.profileId.toString());
      return m
        ? [
            {
              id: m._id.toString(),
              fullName: m.fullName,
              relation: m.relation ?? 'other',
              level: r.level,
            },
          ]
        : [];
    });
  }
}
