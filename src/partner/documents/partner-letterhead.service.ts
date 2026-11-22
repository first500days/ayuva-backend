import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Provider,
  ProviderDocument,
} from '../../core/providers/schemas/provider.schema';
import { StorageService } from '../../storage/storage.service';
import { parseJpeg } from '../../common/pdf/simple-pdf';
import type { PartnerActor } from '../rbac/partner-perm.guard';
import { UpdateLetterheadDto } from './dto/letterhead.dto';

const LOGO_MAX_BYTES = 1024 * 1024;
const TEXT_FIELDS = [
  'displayName',
  'tagline',
  'addressLine',
  'contactLine',
  'registrationLine',
  'footerNote',
  'accentColor',
] as const;

/** The organisation's own header, footer and logo for the documents it issues. */
@Injectable()
export class PartnerLetterheadService {
  constructor(
    @InjectModel(Provider.name)
    private readonly providerModel: Model<ProviderDocument>,
    private readonly storage: StorageService,
  ) {}

  async get(actor: PartnerActor) {
    return this.view(await this.load(actor));
  }

  async update(actor: PartnerActor, dto: UpdateLetterheadDto) {
    const provider = await this.load(actor);
    const next: Record<string, unknown> = { ...this.plain(provider) };
    for (const key of TEXT_FIELDS) {
      const v = dto[key];
      if (v === undefined) continue;
      const t = v.trim();
      if (t) next[key] = t;
      else delete next[key];
    }
    provider.set('letterhead', next);
    await provider.save();
    return this.view(provider);
  }

  /** The logo is stored as a JPEG; the portal converts whatever the user picks before uploading. */
  async setLogo(actor: PartnerActor, file: Express.Multer.File | undefined) {
    if (!file?.buffer?.length)
      throw new BadRequestException('Choose a logo image');
    if (file.size > LOGO_MAX_BYTES)
      throw new BadRequestException('Logo must be under 1 MB');
    if (!parseJpeg(file.buffer))
      throw new BadRequestException('Logo must be a JPEG image');
    const provider = await this.load(actor);
    const previous = provider.letterhead?.logoRef;
    const ref = await this.storage.upload(
      file.buffer,
      'letterhead-logo.jpg',
      provider.id as string,
      'credentials',
    );
    provider.set('letterhead', { ...this.plain(provider), logoRef: ref });
    await provider.save();
    if (previous) await this.storage.remove(previous);
    return this.view(provider);
  }

  async removeLogo(actor: PartnerActor) {
    const provider = await this.load(actor);
    const previous = provider.letterhead?.logoRef;
    const next = { ...this.plain(provider) };
    delete next.logoRef;
    provider.set('letterhead', next);
    await provider.save();
    if (previous) await this.storage.remove(previous);
    return this.view(provider);
  }

  async logo(actor: PartnerActor): Promise<Buffer> {
    const ref = (await this.load(actor)).letterhead?.logoRef;
    if (!ref) throw new NotFoundException('No logo uploaded');
    return this.storage.read(ref);
  }

  async provider(actor: PartnerActor) {
    return this.load(actor);
  }

  private async load(actor: PartnerActor) {
    const provider = await this.providerModel
      .findById(actor.provider._id)
      .exec();
    if (!provider) throw new NotFoundException('Organisation not found');
    return provider;
  }

  private plain(p: ProviderDocument): Record<string, unknown> {
    const lh = p.letterhead as unknown as
      | { toObject?: () => object }
      | undefined;
    return lh ? { ...(lh.toObject ? lh.toObject() : lh) } : {};
  }

  private view(p: ProviderDocument) {
    const lh = p.letterhead;
    return {
      displayName: lh?.displayName ?? '',
      tagline: lh?.tagline ?? '',
      addressLine: lh?.addressLine ?? '',
      contactLine: lh?.contactLine ?? '',
      registrationLine: lh?.registrationLine ?? '',
      footerNote: lh?.footerNote ?? '',
      accentColor: lh?.accentColor ?? '',
      hasLogo: !!lh?.logoRef,
      // What the document falls back to for fields left blank.
      defaults: {
        name: p.name,
        address: p.locations?.[0]?.address ?? '',
        phone: p.phone ?? '',
      },
    };
  }
}
