import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Hospital, HospitalDocument, HospitalStatus } from './schemas/hospital.schema';
import { Provider, ProviderDocument, ProviderStatus } from '../providers/schemas/provider.schema';
import { QueryHospitalsDto } from './dto/query-hospitals.dto';
import { HospitalResponseDto } from './dto/hospital-response.dto';
import { ProviderResponseDto } from '../providers/dto/provider-response.dto';
import { buildSafeRegex } from '../../common/utils/regex.util';

const HOSPITAL_TYPE_LABEL: Record<string, string> = {
  multi_speciality: 'Multi-speciality',
  general: 'General',
  children: 'Children',
  maternity: 'Maternity',
  day_care: 'Day care',
  // schema enums
  CLINIC: 'Clinic',
  HOSPITAL: 'Hospital',
};

@Injectable()
export class HospitalsService {
  constructor(
    @InjectModel(Hospital.name)
    private readonly hospitalModel: Model<HospitalDocument>,
    @InjectModel(Provider.name)
    private readonly providerModel: Model<ProviderDocument>,
  ) {}

  async findAll(query: QueryHospitalsDto): Promise<HospitalResponseDto[]> {
    const filter: Record<string, unknown> = { status: HospitalStatus.ACTIVE };

    if (query.query) {
      const re = buildSafeRegex(query.query);
      filter['$or'] = [{ name: re }, { specialty: re }];
    }
    if (query.type && query.type !== 'All') {
      filter['type'] = query.type;
    }
    if (query.emergencyOnly === 'true') {
      filter['departments'] = { $in: [/emergency/i] };
    }
    if (query.cashlessOnly === 'true') {
      // If the schema has a cashless flag we'd filter here; for now skip
    }

    const sort: Record<string, 1 | -1> =
      query.sort === 'fee' ? { avgWaitMinutes: 1 } : { rating: -1 };

    const hospitals = await this.hospitalModel.find(filter).sort(sort).exec();
    return hospitals.map((h) => this.toResponse(h));
  }

  async findOne(id: string): Promise<HospitalResponseDto> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Hospital not found');
    const hospital = await this.hospitalModel.findOne({
      _id: id,
      status: HospitalStatus.ACTIVE,
    });
    if (!hospital) throw new NotFoundException('Hospital not found');
    return this.toResponse(hospital);
  }

  async getDoctors(hospitalId: string, userId: string): Promise<ProviderResponseDto[]> {
    if (!Types.ObjectId.isValid(hospitalId)) throw new NotFoundException('Hospital not found');
    const providers = await this.providerModel
      .find({
        status: ProviderStatus.ACTIVE,
        'locations.label': { $regex: /hospital/i },
      })
      .limit(20)
      .exec();
    return providers.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      specialty: p.specialty,
      locations: p.locations,
      languages: p.languages,
      rating: p.rating,
      avgWaitMinutes: p.avgWaitMinutes,
      consultationFee: p.consultationFee,
      saved: p.savedByUserIds.some((u) => u.toString() === userId),
    }));
  }

  private toResponse(h: HospitalDocument): HospitalResponseDto {
    return {
      id: h.id,
      name: h.name,
      type: h.type,
      typeLabel: HOSPITAL_TYPE_LABEL[h.type] ?? h.type,
      address: h.locations?.[0]?.address ?? '',
      locality: h.locations?.[0]?.label ?? '',
      distanceKm: 0, // live location not captured yet
      lat: h.locations?.[0]?.lat ?? 0,
      lng: h.locations?.[0]?.lng ?? 0,
      imageUrl: h.profileImageUrl,
      rating: h.rating ?? 0,
      reviewCount: 0,
      consultationFeeFrom: 0,
      doctorCount: 0,
      operationalTags: [],
      departments: (h.departments ?? []).map((name, i) => ({
        id: String(i),
        name,
        icon: 'local-hospital',
        doctorCount: 0,
      })),
      facilities: h.facilities ?? [],
      insuranceAccepted: [],
      cashless: false,
      nextAvailableSlots: [],
      about: '',
    };
  }
}
