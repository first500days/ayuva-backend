import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { buildSafeRegex } from '../../common/utils/regex.util';
import { PartnerActor } from '../rbac/partner-perm.guard';
import {
  LabCatalogItem,
  LabCatalogItemDocument,
} from './schemas/lab-catalog-item.schema';
import { STARTER_CATALOG } from './lab-starter-catalog';
import {
  CatalogQueryDto,
  CreateCatalogItemDto,
  UpdateCatalogItemDto,
} from './dto/lab.dto';

/** Test Catalog Management: the centre's tests and packages, prices, turnaround and report parameters. */
@Injectable()
export class PartnerLabCatalogService {
  constructor(
    @InjectModel(LabCatalogItem.name)
    private readonly catalogModel: Model<LabCatalogItemDocument>,
  ) {}

  async list(actor: PartnerActor, q: CatalogQueryDto) {
    const filter: Record<string, unknown> = { providerId: actor.provider._id };
    if (q.category) filter.category = q.category;
    if (q.active !== undefined) filter.active = q.active;
    if (q.q?.trim()) {
      const re = buildSafeRegex(q.q);
      filter.$or = [{ name: re }, { code: re }, { category: re }];
    }
    const items = await this.catalogModel
      .find(filter)
      .sort({ category: 1, name: 1 })
      .exec();
    const nameById = new Map(items.map((i) => [i.id, i.name]));
    return items.map((i) => this.toResponse(i, nameById));
  }

  async create(actor: PartnerActor, dto: CreateCatalogItemDto) {
    const code = dto.code.trim().toUpperCase();
    if (
      await this.catalogModel.exists({ providerId: actor.provider._id, code })
    ) {
      throw new ConflictException(`A test with code ${code} already exists`);
    }
    const includes = await this.validIncludes(actor, dto.includes);
    this.assertParameters(dto.parameters);
    const item = await this.catalogModel.create({
      ...dto,
      code,
      providerId: actor.provider._id,
      includes,
      isPackage: dto.isPackage ?? includes.length > 0,
    });
    return this.toResponse(item);
  }

  async update(actor: PartnerActor, id: string, dto: UpdateCatalogItemDto) {
    const item = await this.load(actor, id);
    if (dto.includes !== undefined) {
      if (dto.includes.includes(item.id))
        throw new BadRequestException('A package can’t include itself');
      item.includes = await this.validIncludes(actor, dto.includes);
    }
    if (dto.parameters !== undefined) {
      this.assertParameters(dto.parameters);
      item.set('parameters', dto.parameters);
    }
    for (const [k, v] of Object.entries(dto)) {
      // includes and parameters were validated and applied above.
      if (k === 'includes' || k === 'parameters' || v === undefined) continue;
      item.set(k, v);
    }
    await item.save();
    return this.toResponse(item);
  }

  /** Imports the starter tests whose codes the centre doesn't have yet. */
  async importStarter(actor: PartnerActor) {
    const existing = new Set(
      (
        await this.catalogModel
          .find({ providerId: actor.provider._id })
          .select('code')
          .lean()
          .exec()
      ).map((i) => i.code),
    );
    const created: LabCatalogItemDocument[] = [];
    for (const t of STARTER_CATALOG.filter(
      (s) => !s.includesCodes && !existing.has(s.code),
    )) {
      // Single tests carry no includesCodes, so the starter entry maps straight onto the schema.
      created.push(
        await this.catalogModel.create({
          ...t,
          providerId: actor.provider._id,
          isPackage: false,
        }),
      );
    }
    const byCode = new Map(
      (
        await this.catalogModel
          .find({ providerId: actor.provider._id })
          .select('code')
          .exec()
      ).map((i) => [i.code, i._id]),
    );
    for (const t of STARTER_CATALOG.filter(
      (s) => s.includesCodes && !existing.has(s.code),
    )) {
      const { includesCodes, ...data } = t;
      created.push(
        await this.catalogModel.create({
          ...data,
          providerId: actor.provider._id,
          isPackage: true,
          includes: (includesCodes ?? [])
            .map((c) => byCode.get(c))
            .filter((id): id is Types.ObjectId => id !== undefined),
        }),
      );
    }
    return { imported: created.length, codes: created.map((c) => c.code) };
  }

  /** Resolves catalogue ids for an order; packages expand to their component parameters at report time. */
  async loadForOrder(
    providerId: Types.ObjectId,
    ids: string[],
  ): Promise<LabCatalogItemDocument[]> {
    const valid = [...new Set(ids)].filter((id) => Types.ObjectId.isValid(id));
    const items = await this.catalogModel
      .find({ _id: { $in: valid }, providerId, active: true })
      .exec();
    if (items.length !== valid.length || valid.length !== new Set(ids).size) {
      throw new BadRequestException(
        'One or more tests are not in your active catalogue',
      );
    }
    return items;
  }

  /** Best-effort match of a referral's free-text test names to catalogue items. */
  async matchByNames(
    providerId: Types.ObjectId,
    names: string[],
  ): Promise<LabCatalogItemDocument[]> {
    if (!names.length) return [];
    const items = await this.catalogModel
      .find({ providerId, active: true })
      .exec();
    const norm = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
    const matched = new Map<string, LabCatalogItemDocument>();
    for (const raw of names) {
      const n = norm(raw);
      if (!n) continue;
      const hit =
        items.find((i) => norm(i.code) === n || norm(i.name) === n) ??
        items.find((i) => norm(i.name).includes(n) || n.includes(norm(i.code)));
      if (hit) matched.set(hit.id, hit);
    }
    return [...matched.values()];
  }

  private async load(actor: PartnerActor, id: string) {
    const item = Types.ObjectId.isValid(id)
      ? await this.catalogModel.findOne({
          _id: id,
          providerId: actor.provider._id,
        })
      : null;
    if (!item) throw new NotFoundException('Test not found');
    return item;
  }

  private async validIncludes(
    actor: PartnerActor,
    ids?: string[],
  ): Promise<Types.ObjectId[]> {
    if (!ids?.length) return [];
    const unique = [...new Set(ids)];
    const found = await this.catalogModel
      .find({
        _id: { $in: unique },
        providerId: actor.provider._id,
        isPackage: false,
      })
      .select('_id')
      .exec();
    if (found.length !== unique.length)
      throw new BadRequestException(
        'A package can only include single tests from your catalogue',
      );
    return found.map((f) => f._id);
  }

  private assertParameters(
    params?: {
      name: string;
      refLow?: number;
      refHigh?: number;
      criticalLow?: number;
      criticalHigh?: number;
    }[],
  ) {
    for (const p of params ?? []) {
      if (
        p.refLow !== undefined &&
        p.refHigh !== undefined &&
        p.refLow > p.refHigh
      ) {
        throw new BadRequestException(
          `${p.name}: reference low is above reference high`,
        );
      }
      if (
        p.criticalLow !== undefined &&
        p.criticalHigh !== undefined &&
        p.criticalLow > p.criticalHigh
      ) {
        throw new BadRequestException(
          `${p.name}: critical low is above critical high`,
        );
      }
    }
  }

  toResponse(i: LabCatalogItemDocument, nameById?: Map<string, string>) {
    return {
      id: i.id,
      code: i.code,
      name: i.name,
      category: i.category,
      sampleType: i.sampleType ?? null,
      price: i.price,
      mrp: i.mrp ?? null,
      tatHours: i.tatHours,
      homeCollection: i.homeCollection,
      fastingRequired: i.fastingRequired,
      preparation: i.preparation,
      description: i.description,
      isPackage: i.isPackage,
      includes: i.includes.map((id) => ({
        id: id.toString(),
        name: nameById?.get(id.toString()) ?? null,
      })),
      parameters: i.parameters.map((p) => ({
        name: p.name,
        unit: p.unit ?? null,
        refLow: p.refLow ?? null,
        refHigh: p.refHigh ?? null,
        refText: p.refText ?? null,
        criticalLow: p.criticalLow ?? null,
        criticalHigh: p.criticalHigh ?? null,
      })),
      active: i.active,
      updatedAt: (i.updatedAt ?? new Date()).toISOString(),
    };
  }
}
