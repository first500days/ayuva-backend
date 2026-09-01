import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ConsentGuard } from '../../auth/guards/consent.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ProfileService } from './profile.service';
import { CreateHealthProfileDto } from '../health-profile/dto/create-health-profile.dto';
import { CreateEmergencyContactDto } from '../health-profile/dto/create-emergency-contact.dto';
import { CreateMedicationDto } from '../medications/dto/create-medication.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { AuthUserDto } from '../../auth/dto/auth-tokens-response.dto';
import type { UserDocument } from '../users/schemas/user.schema';
import {
  EmergencyContactResponseDto,
  HealthProfileResponseDto,
  MedicationResponseDto,
} from './dto/onboarding-status-response.dto';

/**
 * Onboarding (TRD §4.1, PRD Module 2). Guarded, but never a hard gate on the
 * rest of the app — a user with no HealthProfile yet can still call any
 * other authenticated endpoint (FR-2.6, "Skip for now").
 */
@ApiTags('Onboarding')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ConsentGuard)
@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  /**
   * The same user summary the login/register responses carry, so the client can
   * swap its cached user wholesale rather than patching one field into it.
   */
  @Get('account')
  @ApiOperation({ summary: 'Get the signed-in patient’s own account summary' })
  @ApiOkResponse({ type: AuthUserDto })
  async getAccount(@CurrentUser() user: JwtPayload): Promise<AuthUserDto> {
    const account = await this.profileService.getAccount(user.sub);
    return this.toAuthUser(
      account,
      await this.profileService.hasHealthProfile(user.sub),
    );
  }

  @Put('account')
  @ApiOperation({
    summary:
      'Update the signed-in patient’s own name — without this the Profile edit only ever lived in the app’s local cache and was lost on the next sign-in',
  })
  @ApiOkResponse({ type: AuthUserDto })
  async updateAccount(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateAccountDto,
  ): Promise<AuthUserDto> {
    const account = await this.profileService.updateAccount(user.sub, dto);
    return this.toAuthUser(
      account,
      await this.profileService.hasHealthProfile(user.sub),
    );
  }

  @Get('health')
  @ApiOperation({
    summary:
      'Get Health Profile — zeroed defaults (not a 404) if onboarding was skipped (FR-2.6)',
  })
  @ApiOkResponse({ type: HealthProfileResponseDto })
  async getHealth(
    @CurrentUser() user: JwtPayload,
  ): Promise<HealthProfileResponseDto> {
    const profile = await this.profileService.getHealthProfile(user.sub);
    return {
      age: profile?.age ?? 0,
      gender: profile?.gender ?? '',
      conditions: profile?.conditions ?? [],
      allergies: profile?.allergies ?? [],
    };
  }

  @Put('health')
  @ApiOperation({ summary: 'Create/update Health Profile (FR-2.1-2.3)' })
  @ApiOkResponse({ type: HealthProfileResponseDto })
  async upsertHealth(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateHealthProfileDto,
  ): Promise<HealthProfileResponseDto> {
    const profile = await this.profileService.upsertHealthProfile(
      user.sub,
      dto,
    );
    return {
      age: profile.age,
      gender: profile.gender,
      conditions: profile.conditions,
      allergies: profile.allergies,
    };
  }

  @Post('medications')
  @ApiOperation({
    summary: 'Add a medication captured during onboarding (FR-2.3)',
  })
  @ApiCreatedResponse({ type: MedicationResponseDto })
  async addMedication(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateMedicationDto,
  ): Promise<MedicationResponseDto> {
    const medication = await this.profileService.addMedication(user.sub, dto);
    return {
      id: medication.id,
      name: medication.name,
      dosage: medication.dosage,
      frequency: medication.frequency,
      scheduleTimes: medication.scheduleTimes,
      active: medication.active,
    };
  }

  @Get('emergency-contact')
  @ApiOperation({
    summary:
      'Get emergency contact — zeroed defaults (not a 404) if not yet set (FR-2.6)',
  })
  @ApiOkResponse({ type: EmergencyContactResponseDto })
  async getEmergencyContact(
    @CurrentUser() user: JwtPayload,
  ): Promise<EmergencyContactResponseDto> {
    const contact = await this.profileService.getEmergencyContact(user.sub);
    return { name: contact?.name ?? '', phone: contact?.phone ?? '' };
  }

  @Put('emergency-contact')
  @ApiOperation({ summary: 'Set emergency contact (FR-2.4)' })
  @ApiOkResponse({ type: EmergencyContactResponseDto })
  async upsertEmergencyContact(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateEmergencyContactDto,
  ): Promise<EmergencyContactResponseDto> {
    const contact = await this.profileService.upsertEmergencyContact(
      user.sub,
      dto,
    );
    return { name: contact.name, phone: contact.phone };
  }

  private toAuthUser(
    account: UserDocument,
    onboardingComplete: boolean,
  ): AuthUserDto {
    return {
      id: account.id,
      fullName: account.fullName,
      email: account.email,
      role: account.role,
      onboardingComplete,
    };
  }
}
