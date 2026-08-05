import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter, Types } from 'mongoose';
import {
  Provider,
  ProviderDocument,
  ProviderStatus,
} from './schemas/provider.schema';
import {
  AppointmentSlot,
  AppointmentSlotDocument,
} from './schemas/appointment-slot.schema';
import {
  QueryProvidersDto,
  ProviderSortOption,
} from './dto/query-providers.dto';
import { ProviderResponseDto } from './dto/provider-response.dto';
import { AppointmentSlotResponseDto } from './dto/appointment-slot-response.dto';
import { buildSafeRegex } from '../../common/utils/regex.util';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class ProvidersService {
  constructor(
    @InjectModel(Provider.name)
    private readonly providerModel: Model<ProviderDocument>,
    @InjectModel(AppointmentSlot.name)
    private readonly slotModel: Model<AppointmentSlotDocument>,
  ) {}

  async findAll(
    query: QueryProvidersDto,
    userId: string,
  ): Promise<ProviderResponseDto[]> {
    const and: QueryFilter<ProviderDocument>[] = [
      { status: ProviderStatus.ACTIVE },
    ];

    if (query.query) {
      const re = buildSafeRegex(query.query);
      and.push({ $or: [{ name: re }, { specialty: re }] });
    }
    if (query.specialty) {
      const re = buildSafeRegex(query.specialty);
      and.push({ $or: [{ type: re }, { specialty: re }] });
    }
    if (query.location) {
      const re = buildSafeRegex(query.location);
      and.push({
        $or: [{ 'locations.label': re }, { 'locations.address': re }],
      });
    }

    const filter: QueryFilter<ProviderDocument> =
      and.length > 1 ? { $and: and } : and[0];

    // 'distance' needs the patient's live location, which nothing captures yet — fall back to rating.
    const sort: Record<string, 1 | -1> =
      query.sort === ProviderSortOption.WAIT
        ? { avgWaitMinutes: 1 }
        : { rating: -1 };

    const providers = await this.providerModel.find(filter).sort(sort).exec();
    return providers.map((p) => this.toResponse(p, userId));
  }

  async findOne(id: string, userId: string): Promise<ProviderResponseDto> {
    const provider = await this.getActiveProviderOrThrow(id);
    return this.toResponse(provider, userId);
  }

  async toggleSave(id: string, userId: string): Promise<{ saved: boolean }> {
    const provider = await this.getActiveProviderOrThrow(id);
    const alreadySaved = provider.savedByUserIds.some(
      (u) => u.toString() === userId,
    );

    await this.providerModel.updateOne(
      { _id: id },
      alreadySaved
        ? { $pull: { savedByUserIds: new Types.ObjectId(userId) } }
        : { $addToSet: { savedByUserIds: new Types.ObjectId(userId) } },
    );

    return { saved: !alreadySaved };
  }

  async getSlots(
    providerId: string,
    date: string,
  ): Promise<AppointmentSlotResponseDto[]> {
    await this.getActiveProviderOrThrow(providerId);
    if (!ISO_DATE_PATTERN.test(date)) {
      throw new BadRequestException(
        'date must be an ISO date string (YYYY-MM-DD)',
      );
    }

    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(`${date}T23:59:59.999Z`);
    if (Number.isNaN(dayStart.getTime())) {
      throw new BadRequestException('date must be a valid calendar date');
    }

    const slots = await this.slotModel
      .find({
        providerId: new Types.ObjectId(providerId),
        date: { $gte: dayStart, $lte: dayEnd },
      })
      .sort({ time: 1 })
      .exec();

    return slots.map((s) => ({
      id: s.id,
      date,
      time: s.time,
      period: this.periodOf(s.time),
      durationMin: s.durationMin,
      status: s.status,
    }));
  }

  private async getActiveProviderOrThrow(
    id: string,
  ): Promise<ProviderDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Provider not found');
    }
    // Inactive providers are excluded from every patient-facing view (FR-13.4).
    const provider = await this.providerModel.findOne({
      _id: id,
      status: ProviderStatus.ACTIVE,
    });
    if (!provider) {
      throw new NotFoundException('Provider not found');
    }
    return provider;
  }

  private periodOf(time: string): 'morning' | 'afternoon' {
    const hour = parseInt(time.split(':')[0] ?? '0', 10);
    return hour < 12 ? 'morning' : 'afternoon';
  }

  private toResponse(
    provider: ProviderDocument,
    userId: string,
  ): ProviderResponseDto {
    return {
      id: provider.id,
      name: provider.name,
      type: provider.type,
      specialty: provider.specialty,
      locations: provider.locations,
      languages: provider.languages,
      rating: provider.rating,
      avgWaitMinutes: provider.avgWaitMinutes,
      consultationFee: provider.consultationFee,
      saved: provider.savedByUserIds.some((u) => u.toString() === userId),
    };
  }
}
