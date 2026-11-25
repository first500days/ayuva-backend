import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StorageService } from '../../storage/storage.service';
import { parseJpeg } from '../../common/pdf/simple-pdf';
import type { PartnerActor } from '../rbac/partner-perm.guard';
import { registrationStateOf } from '../staff/registration-status';
import { UpdateRxPadDto } from './dto/rx-pad.dto';

const SIGNATURE_MAX_BYTES = 300 * 1024;
const TEXT_FIELDS = [
  'printedName',
  'qualifications',
  'specialty',
  'timings',
  'contact',
] as const;

/** The one-line extra under the prescriber's name on the slip: specialty · hours · contact. */
export function padLine(pad?: {
  specialty?: string;
  timings?: string;
  contact?: string;
}): string {
  return [pad?.specialty, pad?.timings, pad?.contact]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(' · ');
}

/**
 * A prescriber's own prescription pad: how their name and degrees print, an
 * optional extra line, and their signature image. Plus a read-only copy of the
 * organisation's letterhead so the live preview can draw the slip as it prints
 * (the letterhead itself stays an admin setting).
 */
@Injectable()
export class PartnerRxPadService {
  constructor(private readonly storage: StorageService) {}

  view(actor: PartnerActor) {
    const m = actor.member;
    const pad = m.rxPad;
    const lh = actor.provider.letterhead;
    const registration = registrationStateOf(m, actor.provider);
    return {
      printedName: pad?.printedName ?? '',
      qualifications: pad?.qualifications ?? '',
      specialty: pad?.specialty ?? '',
      timings: pad?.timings ?? '',
      contact: pad?.contact ?? '',
      hasSignature: !!pad?.signatureRef,
      signatureUpdatedAt: pad?.signatureUpdatedAt?.toISOString() ?? null,
      // What prints when a field is left blank.
      defaults: {
        name: m.fullName,
        title: m.title ?? '',
        registrationNumber: registration.number,
        registrationStatus: registration.status,
      },
      letterhead: {
        // Same rule as the PDF header: with no letterhead set up, documents
        // open with the coloured band (name, then address · phone).
        custom:
          !!lh?.logoRef ||
          [
            lh?.displayName,
            lh?.tagline,
            lh?.addressLine,
            lh?.contactLine,
            lh?.registrationLine,
          ].some((x) => !!x?.trim()),
        bandSubtitle:
          [actor.provider.locations?.[0]?.address, actor.provider.phone]
            .filter(Boolean)
            .join(' · ') || 'Ayuva partner',
        title: lh?.displayName?.trim() || actor.provider.name,
        lines: [
          lh?.tagline,
          lh?.addressLine?.trim() || actor.provider.locations?.[0]?.address,
          lh?.contactLine?.trim() || actor.provider.phone,
          lh?.registrationLine,
        ].filter((x): x is string => !!x?.trim()),
        accentColor: lh?.accentColor ?? '',
        footerNote: lh?.footerNote ?? '',
        hasLogo: !!lh?.logoRef,
      },
    };
  }

  async update(actor: PartnerActor, dto: UpdateRxPadDto) {
    const m = actor.member;
    const next: Record<string, unknown> = { ...this.plain(actor) };
    for (const key of TEXT_FIELDS) {
      const v = dto[key];
      if (v === undefined) continue;
      const t = v.trim();
      if (t) next[key] = t;
      else delete next[key];
    }
    m.set('rxPad', next);
    await m.save();
    return this.view(actor);
  }

  /** Stored as a JPEG (the PDFs embed JPEG only); the portal converts drawings and photos first. */
  async setSignature(
    actor: PartnerActor,
    file: Express.Multer.File | undefined,
  ) {
    if (!file?.buffer?.length)
      throw new BadRequestException('Add a signature image');
    if (file.size > SIGNATURE_MAX_BYTES)
      throw new BadRequestException('Signature image must be under 300 KB');
    if (!parseJpeg(file.buffer))
      throw new BadRequestException('Signature must be a JPEG image');
    const m = actor.member;
    const ref = await this.storage.upload(
      file.buffer,
      'signature.jpg',
      actor.provider.id,
      'credentials',
    );
    // The previous file is kept: prescriptions signed with it still print it.
    m.set('rxPad', {
      ...this.plain(actor),
      signatureRef: ref,
      signatureUpdatedAt: new Date(),
    });
    await m.save();
    return this.view(actor);
  }

  async removeSignature(actor: PartnerActor) {
    const m = actor.member;
    const next = { ...this.plain(actor) };
    delete next.signatureRef;
    delete next.signatureUpdatedAt;
    m.set('rxPad', next);
    await m.save();
    return this.view(actor);
  }

  async signature(actor: PartnerActor): Promise<Buffer> {
    const ref = actor.member.rxPad?.signatureRef;
    if (!ref) throw new NotFoundException('No signature saved');
    return this.storage.read(ref);
  }

  async logo(actor: PartnerActor): Promise<Buffer> {
    const ref = actor.provider.letterhead?.logoRef;
    if (!ref) throw new NotFoundException('No logo uploaded');
    return this.storage.read(ref);
  }

  private plain(actor: PartnerActor): Record<string, unknown> {
    const pad = actor.member.rxPad as unknown as
      { toObject?: () => object } | undefined;
    return pad ? { ...(pad.toObject ? pad.toObject() : pad) } : {};
  }
}
