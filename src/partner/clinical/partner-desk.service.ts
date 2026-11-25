import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import { patientAge } from '../../common/utils/age.util';
import {
  HealthProfile,
  HealthProfileDocument,
} from '../../core/health-profile/schemas/health-profile.schema';
import { openIntake } from '../../core/profile/intake-qr';
import { intakeSecret } from '../../core/profile/intake-secret';
import { consentTokenFor } from '../../core/records/schemas/medical-record.schema';
import {
  AccessLog,
  AccessLogDocument,
} from '../../core/sharing/schemas/access-log.schema';
import {
  User,
  UserDocument,
  UserRole,
  UserStatus,
} from '../../core/users/schemas/user.schema';
import { PartnerActor } from '../rbac/partner-perm.guard';
import { DeskRegisterDto } from './dto/intake.dto';
import {
  PartnerCounter,
  PartnerCounterDocument,
} from './schemas/partner-counter.schema';
import {
  PartnerPatientIntake,
  PartnerPatientIntakeDocument,
} from './schemas/patient-intake.schema';

const QR_REASON: Record<string, string> = {
  malformed: 'That isn’t an AYUVA registration code.',
  tampered:
    'This code couldn’t be verified. Ask the patient to open a fresh one in the app.',
  expired:
    'This code has expired (they last 10 minutes). Ask the patient to open a fresh one.',
};

/**
 * This organisation's records that point at a patient, moved from the desk
 * record to the app account when the two are linked. Collection and the
 * filter that keeps the move inside this organisation.
 */
const ORG_RECORDS: [
  collection: string,
  orgFilter: (org: Types.ObjectId) => object,
][] = [
  ['appointments', (org) => ({ providerId: org })],
  ['partner_consultation_notes', (org) => ({ providerId: org })],
  ['partner_patient_allergies', (org) => ({ providerId: org })],
  ['partner_prescriptions', (org) => ({ providerId: org })],
  ['rx_refill_prompts', (org) => ({ providerId: org })],
  ['partner_case_messages', (org) => ({ providerId: org })],
  ['partner_admissions', (org) => ({ providerId: org })],
  ['partner_bill_payments', (org) => ({ providerId: org })],
  ['partner_dispenses', (org) => ({ providerId: org })],
  ['partner_insurance_claims', (org) => ({ providerId: org })],
  ['partner_lis_samples', (org) => ({ providerId: org })],
  ['partner_lab_orders', (org) => ({ providerId: org })],
  ['partner_lab_results', (org) => ({ providerId: org })],
  ['partner_trend_links', (org) => ({ providerId: org })],
  ['partner_prior_auths', (org) => ({ providerId: org })],
  [
    'partner_referrals',
    (org) => ({ $or: [{ fromProviderId: org }, { toProviderId: org }] }),
  ],
];

/** Placeholder consent on desk records (never accepted; the app account brings its own). */
export const DESK_CONSENT_VERSION = 'desk-record';

const normPhone = (p: string) => {
  const digits = p.replace(/[^0-9+]/g, '');
  // Indian 10-digit mobiles are stored with the country code.
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : digits;
};

/** "Orange Blood Hospital" → "OBH"; up to three letters, "PT" if the name has none. */
export function hospitalPrefix(name: string): string {
  const letters = name
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z]/g, '')[0])
    .filter(Boolean)
    .join('')
    .toUpperCase()
    .slice(0, 3);
  return letters || 'PT';
}

/**
 * Front-desk registration for people without the app (walk-ins, phone
 * bookings, no smartphone), and linking that record to their AYUVA account
 * once they have one.
 *
 * A desk patient is a patient account with no sign-in, kept by this
 * organisation (`managedByProviderId`), like a family profile is kept by a
 * guardian. Every portal screen that works for a linked patient works for
 * it: booking, notes, prescriptions, admission, lab, billing.
 */
@Injectable()
export class PartnerDeskService {
  constructor(
    @InjectModel(PartnerPatientIntake.name)
    private readonly intakeModel: Model<PartnerPatientIntakeDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(HealthProfile.name)
    private readonly profileModel: Model<HealthProfileDocument>,
    @InjectModel(PartnerCounter.name)
    private readonly counterModel: Model<PartnerCounterDocument>,
    @InjectModel(AccessLog.name)
    private readonly accessLogModel: Model<AccessLogDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly audit: AuditLogService,
  ) {}

  async register(actor: PartnerActor, dto: DeskRegisterDto) {
    const org = actor.provider._id;
    const phone = normPhone(dto.phone);
    const fullName = dto.fullName.trim().replace(/\s+/g, ' ');
    if (!dto.dateOfBirth && dto.age === undefined)
      throw new BadRequestException('Enter the date of birth or the age');
    const dob = dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined;
    if (dob && (Number.isNaN(dob.getTime()) || dob > new Date()))
      throw new BadRequestException('Enter a valid date of birth');

    // The same phone already here is usually the same person registered twice.
    if (!dto.allowSamePhone) {
      const same = await this.intakeModel
        .findOne({ providerId: org, phone })
        .select('patientId hospitalNo')
        .lean()
        .exec();
      if (same) {
        const who = await this.userModel
          .findById(same.patientId)
          .select('fullName')
          .lean()
          .exec();
        throw new ConflictException({
          message: `${who?.fullName ?? 'A patient'} is already registered here with this phone${same.hospitalNo ? ` (${same.hospitalNo})` : ''}.`,
          existingPatientId: same.patientId.toString(),
          existingName: who?.fullName ?? null,
          existingHospitalNo: same.hospitalNo ?? null,
        });
      }
    }

    const id = new Types.ObjectId();
    const user = await this.userModel.create({
      _id: id,
      fullName,
      // A placeholder that can never receive mail: desk records don't sign in.
      email: `desk-${id.toString()}@patients.ayuva.invalid`,
      role: UserRole.PATIENT,
      status: UserStatus.ACTIVE,
      managedByProviderId: org,
      // Nothing accepted: the person hasn't seen AYUVA's terms. The hospital
      // holds this record under its own consent; the account can't sign in.
      consent: {
        termsAccepted: false,
        privacyAccepted: false,
        healthDataProcessingAccepted: false,
        version: DESK_CONSENT_VERSION,
        acceptedAt: new Date(),
      },
    });
    await this.profileModel.create({
      userId: user._id,
      ...(dob && { dateOfBirth: dob }),
      age: patientAge({ dateOfBirth: dob, age: dto.age }).age ?? dto.age ?? 0,
      gender: dto.gender,
    });
    const hospitalNo = await this.nextHospitalNo(actor);
    const now = new Date();
    await this.intakeModel.create({
      providerId: org,
      patientId: user._id,
      source: 'desk',
      hospitalNo,
      phone,
      address: dto.address?.trim() || undefined,
      emergencyName: dto.emergencyName?.trim() || undefined,
      emergencyPhone: dto.emergencyPhone
        ? normPhone(dto.emergencyPhone)
        : undefined,
      scannedByMemberId: actor.member._id,
      scannedByName: actor.member.fullName,
      scannedAt: now,
    });
    await this.audit.record({
      actorId: actor.member.userId.toString(),
      action: AuditAction.PARTNER_PATIENT_INTAKE,
      targetType: 'User',
      targetId: user.id,
      metadata: { providerId: org.toString(), via: 'desk', hospitalNo },
    });
    return {
      patientId: user.id,
      fullName,
      hospitalNo,
      registeredAt: now.toISOString(),
    };
  }

  /**
   * The patient shows their app's registration QR: this organisation's
   * records move from the desk record to their account, the hospital number
   * stays, and the desk record is retired. The patient sees it in their
   * access history.
   */
  async linkApp(actor: PartnerActor, deskPatientId: string, code: string) {
    const org = actor.provider._id;
    if (!Types.ObjectId.isValid(deskPatientId))
      throw new NotFoundException('Patient not found');
    const desk = await this.userModel
      .findOne({ _id: deskPatientId, managedByProviderId: org })
      .exec();
    if (!desk)
      throw new NotFoundException(
        'Only patients registered at your desk can be linked',
      );
    if (desk.mergedIntoId)
      throw new ConflictException(
        'This record is already linked to an AYUVA account',
      );

    const opened = openIntake(code, intakeSecret());
    if (!opened.ok) throw new BadRequestException(QR_REASON[opened.reason]);
    if (!Types.ObjectId.isValid(opened.payload.uid))
      throw new BadRequestException(QR_REASON.malformed);
    const app = await this.userModel
      .findOne({ _id: opened.payload.uid, role: UserRole.PATIENT })
      .exec();
    if (!app || app.status !== UserStatus.ACTIVE)
      throw new NotFoundException('This AYUVA account no longer exists');
    if (app.managedByProviderId || app.managedBy)
      throw new BadRequestException(
        'That code belongs to a record without its own sign-in. Ask the patient to open the code on their own profile.',
      );
    if (app._id.equals(desk._id))
      throw new BadRequestException('This is the same record');

    // Move this organisation's care onto the account (re-running finishes a partial move).
    const moved: Record<string, number> = {};
    for (const [collection, orgFilter] of ORG_RECORDS) {
      const r = await this.connection
        .collection(collection)
        .updateMany(
          { ...orgFilter(org), patientId: desk._id },
          { $set: { patientId: app._id } },
        );
      if (r.modifiedCount) moved[collection] = r.modifiedCount;
    }
    // Documents this organisation sent to the desk record's vault (discharge
    // summaries, prescriptions) go to the patient's own vault.
    const docs = await this.connection.collection('medicalrecords').updateMany(
      { patientId: desk._id },
      {
        $set: {
          patientId: app._id,
          consentToken:
            consentTokenFor(app.id, app.consent, 'ingestion') ?? null,
        },
      },
    );
    if (docs.modifiedCount) moved.medicalrecords = docs.modifiedCount;

    // The hospital number and desk details now belong to the account's entry here.
    const deskIntake = await this.intakeModel
      .findOne({ providerId: org, patientId: desk._id })
      .lean()
      .exec();
    if (deskIntake)
      await this.intakeModel.deleteOne({ _id: deskIntake._id }).exec();
    const now = new Date();
    const existing = await this.intakeModel
      .findOne({ providerId: org, patientId: app._id })
      .lean()
      .exec();
    await this.intakeModel
      .updateOne(
        { providerId: org, patientId: app._id },
        {
          $set: {
            source: 'qr',
            ...(deskIntake?.hospitalNo &&
              !existing?.hospitalNo && { hospitalNo: deskIntake.hospitalNo }),
            ...(deskIntake?.phone &&
              !existing?.phone && { phone: deskIntake.phone }),
            ...(deskIntake?.address &&
              !existing?.address && { address: deskIntake.address }),
            timezone: opened.payload.tz ?? existing?.timezone,
            emergencyName:
              opened.payload.ec?.name ||
              existing?.emergencyName ||
              deskIntake?.emergencyName,
            emergencyPhone:
              opened.payload.ec?.phone ||
              existing?.emergencyPhone ||
              deskIntake?.emergencyPhone,
            scannedByMemberId: actor.member._id,
            scannedByName: actor.member.fullName,
            scannedAt: now,
            linkedAppAt: now,
          },
        },
        { upsert: true },
      )
      .exec();

    desk.mergedIntoId = app._id;
    desk.status = UserStatus.INACTIVE;
    await desk.save();

    const hospitalNo = existing?.hospitalNo ?? deskIntake?.hospitalNo ?? null;
    await this.accessLogModel.create({
      userId: app._id,
      grantId: 'intake-qr',
      organisationName: actor.provider.name,
      recordTitle: hospitalNo
        ? `your hospital record (${hospitalNo}) linked to your account`
        : 'your hospital record linked to your account',
      action: 'granted',
      viewerUserId: actor.member.userId,
      viewerName: actor.member.fullName,
    });
    await this.audit.record({
      actorId: actor.member.userId.toString(),
      action: AuditAction.PARTNER_PATIENT_INTAKE,
      targetType: 'User',
      targetId: app.id,
      metadata: {
        providerId: org.toString(),
        via: 'desk_link',
        deskPatientId: desk.id,
        hospitalNo,
        moved,
      },
    });
    return {
      patientId: app.id,
      fullName: app.fullName,
      hospitalNo,
      moved,
    };
  }

  /** What the desk knows about a patient here (hospital no., phone, address…), or null. */
  async details(org: Types.ObjectId, patientId: Types.ObjectId) {
    const [intake, user, profile] = await Promise.all([
      this.intakeModel.findOne({ providerId: org, patientId }).lean().exec(),
      this.userModel
        .findById(patientId)
        .select('managedByProviderId')
        .lean()
        .exec(),
      this.profileModel
        .findOne({ userId: patientId })
        .select('age dateOfBirth gender')
        .lean()
        .exec(),
    ]);
    const age = profile ? patientAge(profile).age : null;
    return {
      hospitalNo: intake?.hospitalNo ?? null,
      phone: intake?.phone ?? null,
      address: intake?.address ?? null,
      emergencyName: intake?.emergencyName ?? null,
      emergencyPhone: intake?.emergencyPhone ?? null,
      registeredAt: intake?.scannedAt?.toISOString() ?? null,
      registeredBy: intake?.scannedByName ?? null,
      // Registered at this desk and not on the app yet.
      deskRecord: !!user?.managedByProviderId?.equals(org),
      linkedAppAt: intake?.linkedAppAt?.toISOString() ?? null,
      age: age ?? null,
      gender: profile?.gender ?? null,
    };
  }

  private async nextHospitalNo(actor: PartnerActor): Promise<string> {
    const counter = await this.counterModel
      .findOneAndUpdate(
        { providerId: actor.provider._id, key: 'hospitalNo' },
        { $inc: { seq: 1 } },
        { upsert: true, new: true },
      )
      .lean()
      .exec();
    return `${hospitalPrefix(actor.provider.name)}-${String(counter.seq).padStart(6, '0')}`;
  }
}
