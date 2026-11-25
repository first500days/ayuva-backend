import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import {
  Appointment,
  AppointmentDocument,
} from '../../core/appointments/schemas/appointment.schema';
import { User, UserDocument } from '../../core/users/schemas/user.schema';
import { PartnerPatientsService } from '../clinical/partner-patients.service';
import {
  PartnerPatientIntake,
  PartnerPatientIntakeDocument,
} from '../clinical/schemas/patient-intake.schema';
import type { PartnerActor } from '../rbac/partner-perm.guard';
import { StartTeleconsultDto } from './dto/teleconsult.dto';
import {
  Teleconsult,
  TeleconsultDocument,
  TeleconsultStatus,
} from './schemas/teleconsult.schema';

/** How long the join links work. */
const ROOM_TTL_MS = 2 * 60 * 60_000;
/** A prescription signed this long after a video consultation counts as written on it. */
export const TELECONSULT_RX_WINDOW_MS = 12 * 60 * 60_000;

export interface JoinClaims {
  callId: string;
  role: 'doctor' | 'patient';
  name: string;
}

/** STUN for every call; a TURN relay when configured (needed behind strict mobile networks). */
export function iceServers(): {
  urls: string | string[];
  username?: string;
  credential?: string;
}[] {
  const list: {
    urls: string | string[];
    username?: string;
    credential?: string;
  }[] = [
    {
      urls: (
        process.env.TELECONSULT_STUN_URLS || 'stun:stun.l.google.com:19302'
      )
        .split(',')
        .map((u) => u.trim())
        .filter(Boolean),
    },
  ];
  const turn = process.env.TELECONSULT_TURN_URLS?.split(',')
    .map((u) => u.trim())
    .filter(Boolean);
  if (turn?.length)
    list.push({
      urls: turn,
      username: process.env.TELECONSULT_TURN_USERNAME ?? '',
      credential: process.env.TELECONSULT_TURN_CREDENTIAL ?? '',
    });
  return list;
}

/**
 * Video consultations, browser first (the patient joins from a link on their
 * phone; inside the app later). A two-person WebRTC room per consultation;
 * this service opens and ends rooms and signs the join links. Nothing is
 * recorded. Booking stays "Confirmed (Pay later / pilot)" until a payment
 * gateway exists.
 */
@Injectable()
export class PartnerTeleconsultService {
  private readonly endListeners = new Set<(callId: string) => void>();

  constructor(
    @InjectModel(Teleconsult.name)
    private readonly callModel: Model<TeleconsultDocument>,
    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(PartnerPatientIntake.name)
    private readonly intakeModel: Model<PartnerPatientIntakeDocument>,
    private readonly patients: PartnerPatientsService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditLogService,
  ) {}

  /** The socket gateway listens so "end" reaches both browsers. */
  onEnd(fn: (callId: string) => void): () => void {
    this.endListeners.add(fn);
    return () => this.endListeners.delete(fn);
  }

  async start(actor: PartnerActor, dto: StartTeleconsultDto) {
    if (dto.consent !== true)
      throw new BadRequestException(
        "Record the patient's consent to a video consultation first",
      );
    const patient = await this.patients.assertLinked(actor, dto.patientId);
    if (dto.appointmentId) {
      const ok = await this.appointmentModel.exists({
        _id: dto.appointmentId,
        providerId: actor.provider._id,
        patientId: patient._id,
      });
      if (!ok)
        throw new NotFoundException('Appointment not found for this patient');
    }
    const now = new Date();
    // Re-opening the same consultation keeps the room (and the link already sent).
    let call = await this.callModel
      .findOne({
        providerId: actor.provider._id,
        patientId: patient._id,
        doctorMemberId: actor.member._id,
        status: { $ne: TeleconsultStatus.ENDED },
        expiresAt: { $gt: now },
      })
      .sort({ createdAt: -1 })
      .exec();
    if (!call) {
      call = await this.callModel.create({
        providerId: actor.provider._id,
        patientId: patient._id,
        patientName: patient.fullName,
        ...(dto.appointmentId && {
          appointmentId: new Types.ObjectId(dto.appointmentId),
        }),
        doctorMemberId: actor.member._id,
        doctorName: actor.member.fullName,
        consentAt: now,
        consentByName: actor.member.fullName,
        expiresAt: new Date(now.getTime() + ROOM_TTL_MS),
      });
      await this.record(
        actor,
        call,
        'Video consultation opened (patient consent recorded)',
      );
    }
    const [user, intake] = await Promise.all([
      this.userModel.findById(patient._id).select('phone').lean().exec(),
      this.intakeModel
        .findOne({ providerId: actor.provider._id, patientId: patient._id })
        .select('phone')
        .lean()
        .exec(),
    ]);
    return {
      ...this.view(call),
      doctorToken: this.sign(call, 'doctor', actor.member.fullName),
      patientLink: `${this.config.get<string>('frontend.url') ?? ''}/call/${this.sign(call, 'patient', patient.fullName)}`,
      // For "Send on WhatsApp": the number the patient gave, if any.
      patientPhone: user?.phone ?? intake?.phone ?? null,
      iceServers: iceServers(),
    };
  }

  async end(actor: PartnerActor, id: string) {
    const call = await this.own(actor, id);
    if (call.status !== TeleconsultStatus.ENDED) {
      await this.markEnded(call.id);
      await this.record(actor, call, 'Video consultation ended');
    }
    return this.view((await this.callModel.findById(call._id).exec())!);
  }

  async get(actor: PartnerActor, id: string) {
    return this.view(await this.own(actor, id));
  }

  /** What the patient's join page shows; the link itself is the credential. */
  async publicInfo(token: string) {
    const claims = this.verify(token);
    if (!claims || claims.role !== 'patient')
      throw new NotFoundException('This link is not valid');
    const call = await this.callModel
      .findById(claims.callId)
      .populate<{ providerId: { name: string } }>('providerId', 'name')
      .exec();
    if (!call) throw new NotFoundException('This link is not valid');
    const ended =
      call.status === TeleconsultStatus.ENDED || call.expiresAt < new Date();
    return {
      status: ended ? TeleconsultStatus.ENDED : call.status,
      doctorName: call.doctorName,
      organisation:
        (call.providerId as unknown as { name?: string })?.name ?? '',
      // First name only on a page reached by a link.
      patientFirstName: call.patientName.split(/\s+/)[0] ?? '',
      expiresAt: call.expiresAt.toISOString(),
      iceServers: iceServers(),
    };
  }

  /** Checks a join token for the socket: a live room and the role it was issued for. */
  async admit(token: string): Promise<JoinClaims | null> {
    const claims = this.verify(token);
    if (!claims) return null;
    const call = await this.callModel
      .findById(claims.callId)
      .select('status expiresAt')
      .lean()
      .exec();
    if (
      !call ||
      call.status === TeleconsultStatus.ENDED ||
      call.expiresAt < new Date()
    )
      return null;
    return claims;
  }

  async patientJoined(callId: string) {
    await this.callModel
      .updateOne(
        { _id: callId, status: { $ne: TeleconsultStatus.ENDED } },
        {
          $set: { status: TeleconsultStatus.LIVE },
          $min: { patientJoinedAt: new Date() },
        },
      )
      .exec();
  }

  async markEnded(callId: string) {
    await this.callModel
      .updateOne(
        { _id: callId },
        { $set: { status: TeleconsultStatus.ENDED, endedAt: new Date() } },
      )
      .exec();
    for (const fn of this.endListeners) fn(callId);
  }

  /** Did this doctor see this patient on video recently? (Prescription rules apply.) */
  async recentFor(
    providerId: Types.ObjectId,
    patientId: Types.ObjectId,
    memberId: Types.ObjectId,
  ) {
    return this.callModel.exists({
      providerId,
      patientId,
      doctorMemberId: memberId,
      createdAt: { $gt: new Date(Date.now() - TELECONSULT_RX_WINDOW_MS) },
    });
  }

  private sign(
    call: TeleconsultDocument,
    role: 'doctor' | 'patient',
    name: string,
  ) {
    return this.jwt.sign(
      { callId: call.id, role, name, purpose: 'teleconsult' },
      {
        secret: this.secret(),
        expiresIn: Math.max(
          60,
          Math.floor((call.expiresAt.getTime() - Date.now()) / 1000),
        ),
      },
    );
  }

  private verify(token: string): JoinClaims | null {
    try {
      const p = this.jwt.verify<JoinClaims & { purpose?: string }>(token, {
        secret: this.secret(),
      });
      if (p.purpose !== 'teleconsult' || !Types.ObjectId.isValid(p.callId))
        return null;
      return { callId: p.callId, role: p.role, name: p.name };
    } catch {
      return null;
    }
  }

  /** A key of its own, so a join link can't pass as a sign-in token or vice versa. */
  private secret() {
    return `${this.config.get<string>('jwt.accessSecret')}::teleconsult`;
  }

  private async own(actor: PartnerActor, id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Consultation not found');
    const call = await this.callModel
      .findOne({
        _id: id,
        providerId: actor.provider._id,
        doctorMemberId: actor.member._id,
      })
      .exec();
    if (!call) throw new NotFoundException('Consultation not found');
    return call;
  }

  private view(c: TeleconsultDocument) {
    const ended =
      c.status === TeleconsultStatus.ENDED || c.expiresAt < new Date();
    return {
      id: c.id,
      status: ended ? TeleconsultStatus.ENDED : c.status,
      patientId: c.patientId.toString(),
      patientName: c.patientName,
      appointmentId: c.appointmentId?.toString() ?? null,
      doctorName: c.doctorName,
      consentAt: c.consentAt.toISOString(),
      patientJoinedAt: c.patientJoinedAt?.toISOString() ?? null,
      endedAt: c.endedAt?.toISOString() ?? null,
      expiresAt: c.expiresAt.toISOString(),
    };
  }

  private record(
    actor: PartnerActor,
    call: TeleconsultDocument,
    label: string,
  ) {
    return this.audit.record({
      actorId: actor.userId,
      action: AuditAction.PARTNER_TELECONSULT,
      targetType: 'Teleconsult',
      targetId: call.id,
      metadata: {
        providerId: actor.provider.id,
        patientId: call.patientId.toString(),
        label,
      },
    });
  }
}
