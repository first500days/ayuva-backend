import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import { patientAge } from '../../common/utils/age.util';
import {
  HealthProfile,
  HealthProfileDocument,
} from '../health-profile/schemas/health-profile.schema';
import {
  User,
  UserDocument,
  UserRole,
  UserStatus,
} from '../users/schemas/user.schema';
import { CreateFamilyMemberDto, UpdateFamilyMemberDto } from './dto/family.dto';

export const MAX_FAMILY_MEMBERS = 8;

/**
 * Family profiles: a parent or caregiver adds people they look after. Each
 * one is a patient account of its own (records, appointments, medicines)
 * with no sign-in, managed by the guardian, who switches to it in the app.
 * The switch itself happens in JwtStrategy (X-Ayuva-Profile).
 */
@Injectable()
export class FamilyService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(HealthProfile.name)
    private readonly profileModel: Model<HealthProfileDocument>,
    private readonly audit: AuditLogService,
  ) {}

  async list(userId: string) {
    const [me, members] = await Promise.all([
      this.userModel.findById(userId).select('fullName').lean().exec(),
      this.userModel
        .find({
          managedBy: new Types.ObjectId(userId),
          status: UserStatus.ACTIVE,
        })
        .select('fullName relation')
        .sort({ createdAt: 1 })
        .lean()
        .exec(),
    ]);
    if (!me) throw new NotFoundException('Account not found');
    const profiles = await this.profileModel
      .find({ userId: { $in: members.map((m) => m._id) } })
      .select('userId age dateOfBirth gender')
      .lean()
      .exec();
    const byUser = new Map(profiles.map((p) => [p.userId.toString(), p]));
    return [
      {
        id: userId,
        fullName: me.fullName,
        relation: 'self',
        self: true,
        age: null,
        gender: null,
      },
      ...members.map((m) => {
        const p = byUser.get(m._id.toString());
        return {
          id: m._id.toString(),
          fullName: m.fullName,
          relation: m.relation ?? 'other',
          self: false,
          age: p ? (patientAge(p).age ?? null) : null,
          gender: p?.gender ?? null,
        };
      }),
    ];
  }

  async add(userId: string, dto: CreateFamilyMemberDto) {
    const guardian = await this.userModel.findById(userId).exec();
    if (!guardian || guardian.role !== UserRole.PATIENT)
      throw new BadRequestException(
        'Only patient accounts can add family members',
      );
    if (guardian.managedBy)
      throw new BadRequestException('A family member can’t add family members');
    const count = await this.userModel.countDocuments({
      managedBy: guardian._id,
      status: UserStatus.ACTIVE,
    });
    if (count >= MAX_FAMILY_MEMBERS)
      throw new BadRequestException(
        `Up to ${MAX_FAMILY_MEMBERS} family members`,
      );
    const dob = new Date(dto.dateOfBirth);
    if (Number.isNaN(dob.getTime()) || dob > new Date())
      throw new BadRequestException('Enter a valid date of birth');
    const id = new Types.ObjectId();
    const member = await this.userModel.create({
      _id: id,
      fullName: dto.fullName.trim(),
      // A placeholder that can never receive mail: family members don't sign in.
      email: `family-${id.toString()}@dependents.ayuva.invalid`,
      role: UserRole.PATIENT,
      status: UserStatus.ACTIVE,
      // The guardian accepts the terms on the family member's behalf.
      consent: guardian.consent,
      country: guardian.country,
      timezone: guardian.timezone,
      language: guardian.language,
      managedBy: guardian._id,
      relation: dto.relation,
    });
    await this.profileModel.create({
      userId: member._id,
      dateOfBirth: dob,
      age: patientAge({ dateOfBirth: dob }).age ?? 0,
      gender: dto.gender,
    });
    await this.record(
      userId,
      member,
      `Family member added: ${member.fullName} (${dto.relation})`,
    );
    return (await this.list(userId)).find((p) => p.id === member.id)!;
  }

  async update(userId: string, id: string, dto: UpdateFamilyMemberDto) {
    const member = await this.member(userId, id);
    if (dto.fullName !== undefined) member.fullName = dto.fullName.trim();
    if (dto.relation !== undefined) member.relation = dto.relation;
    await member.save();
    await this.record(
      userId,
      member,
      `Family member updated: ${member.fullName}`,
    );
    return (await this.list(userId)).find((p) => p.id === member.id)!;
  }

  /** Takes the profile off the switcher. Their records stay, as medical records must. */
  async remove(userId: string, id: string) {
    const member = await this.member(userId, id);
    member.status = UserStatus.DEACTIVATED;
    member.deactivatedAt = new Date();
    await member.save();
    await this.record(
      userId,
      member,
      `Family member removed: ${member.fullName}`,
    );
    return { removed: true };
  }

  private async member(userId: string, id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Family member not found');
    const m = await this.userModel
      .findOne({
        _id: id,
        managedBy: new Types.ObjectId(userId),
        status: UserStatus.ACTIVE,
      })
      .exec();
    if (!m) throw new NotFoundException('Family member not found');
    return m;
  }

  private record(userId: string, member: UserDocument, label: string) {
    return this.audit.record({
      actorId: userId,
      action: AuditAction.FAMILY_PROFILE_UPDATE,
      targetType: 'User',
      targetId: member.id,
      metadata: { label },
    });
  }
}
