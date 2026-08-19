import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Hospital, HospitalDocument, HospitalStatus, HospitalType } from '../../core/hospitals/schemas/hospital.schema';
import { QueryAdminHospitalsDto } from './dto/query-admin-hospitals.dto';
import { CreateHospitalDto } from './dto/create-hospital.dto';
import { UpdateHospitalDto } from './dto/update-hospital.dto';
import { AdminHospitalResponseDto } from './dto/admin-hospital-response.dto';
import { buildSafeRegex } from '../../common/utils/regex.util';
import { MailService } from '../../mail/mail.service';

@Injectable()
export class AdminHospitalsService {
  constructor(
    @InjectModel(Hospital.name)
    private readonly hospitalModel: Model<HospitalDocument>,
    private readonly mailService: MailService,
  ) {}

  async findAll(query: QueryAdminHospitalsDto): Promise<AdminHospitalResponseDto[]> {
    const and: any[] = [];

    if (query.search) {
      const re = buildSafeRegex(query.search);
      and.push({ $or: [{ name: re }, { specialty: re }] });
    }
    if (query.type) and.push({ type: query.type });
    if (query.status) and.push({ status: query.status });

    const filter = and.length > 0 ? { $and: and } : {};

    const hospitals = await this.hospitalModel
      .find(filter)
      .sort({ name: 1 })
      .exec();

    return hospitals.map((h) => this.toResponse(h));
  }

  async findOne(id: string): Promise<AdminHospitalResponseDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Hospital not found');
    }
    const hospital = await this.hospitalModel.findById(id).exec();
    if (!hospital) {
      throw new NotFoundException('Hospital not found');
    }
    return this.toResponse(hospital);
  }

  async create(dto: CreateHospitalDto): Promise<AdminHospitalResponseDto> {
    const hospital = await this.hospitalModel.create({
      name: dto.name,
      type: dto.type,
      email: dto.email,
      phone: dto.phone,
      specialty: dto.specialty,
      departments: dto.departments,
      facilities: dto.facilities,
      languages: dto.languages,
      locations: dto.locations,
      rating: dto.rating ?? 0,
      avgWaitMinutes: dto.avgWaitMinutes ?? 0,
      profileImageUrl: dto.profileImageUrl,
      status: HospitalStatus.PENDING,
    });
    if (hospital.email) {
      void this.mailService.sendWelcomeEmail(hospital.email, hospital.name, 'Hospital');
    }
    return this.toResponse(hospital);
  }

  async update(id: string, dto: UpdateHospitalDto): Promise<AdminHospitalResponseDto> {
    const hospital = await this.getHospitalOrThrow(id);

    if (dto.name !== undefined) hospital.name = dto.name;
    if (dto.type !== undefined) hospital.type = dto.type;
    if (dto.email !== undefined) hospital.email = dto.email;
    if (dto.phone !== undefined) hospital.phone = dto.phone;
    if (dto.specialty !== undefined) hospital.specialty = dto.specialty;
    if (dto.departments !== undefined) hospital.departments = dto.departments;
    if (dto.facilities !== undefined) hospital.facilities = dto.facilities;
    if (dto.languages !== undefined) hospital.languages = dto.languages;
    if (dto.locations !== undefined) hospital.locations = dto.locations;
    if (dto.rating !== undefined) hospital.rating = dto.rating;
    if (dto.avgWaitMinutes !== undefined) hospital.avgWaitMinutes = dto.avgWaitMinutes;
    if (dto.profileImageUrl !== undefined) hospital.profileImageUrl = dto.profileImageUrl;
    if (dto.status !== undefined) hospital.status = dto.status;

    await hospital.save();
    return this.toResponse(hospital);
  }

  async verify(id: string): Promise<AdminHospitalResponseDto> {
    const hospital = await this.getHospitalOrThrow(id);
    hospital.status = HospitalStatus.VERIFIED;
    await hospital.save();
    return this.toResponse(hospital);
  }

  async reject(id: string): Promise<AdminHospitalResponseDto> {
    const hospital = await this.getHospitalOrThrow(id);
    hospital.status = HospitalStatus.REJECTED;
    await hospital.save();
    return this.toResponse(hospital);
  }

  async suspend(id: string): Promise<AdminHospitalResponseDto> {
    const hospital = await this.getHospitalOrThrow(id);
    hospital.status = HospitalStatus.SUSPENDED;
    await hospital.save();
    return this.toResponse(hospital);
  }

  async activate(id: string): Promise<AdminHospitalResponseDto> {
    const hospital = await this.getHospitalOrThrow(id);
    hospital.status = HospitalStatus.ACTIVE;
    await hospital.save();
    return this.toResponse(hospital);
  }

  private async getHospitalOrThrow(id: string): Promise<HospitalDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Hospital not found');
    }
    const hospital = await this.hospitalModel.findById(id).exec();
    if (!hospital) {
      throw new NotFoundException('Hospital not found');
    }
    return hospital;
  }

  private toResponse(hospital: HospitalDocument): AdminHospitalResponseDto {
    return {
      id: hospital.id,
      name: hospital.name,
      type: hospital.type,
      email: hospital.email,
      phone: hospital.phone,
      specialty: hospital.specialty,
      locations: hospital.locations.map((l) => ({
        label: l.label,
        address: l.address,
        lat: l.lat,
        lng: l.lng,
      })),
      languages: hospital.languages,
      rating: hospital.rating,
      avgWaitMinutes: hospital.avgWaitMinutes,
      status: hospital.status,
      profileImageUrl: hospital.profileImageUrl,
      departments: hospital.departments,
      facilities: hospital.facilities,
    };
  }
}
