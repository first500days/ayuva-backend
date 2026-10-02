import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Model } from 'mongoose';
import {
  CURRENT_CONSENT_VERSION,
  User,
  UserDocument,
  UserRole,
  UserStatus,
} from '../core/users/schemas/user.schema';
import {
  Provider,
  ProviderCategory,
  ProviderDocument,
  ProviderStatus,
} from '../core/providers/schemas/provider.schema';
import {
  ShareOrganisation,
  ShareOrganisationDocument,
} from '../core/sharing/schemas/share-organisation.schema';
import { AuthService } from '../auth/auth.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../audit-log/schemas/audit-log.schema';
import { AuthTokensResponseDto } from '../auth/dto/auth-tokens-response.dto';
import { AppNotificationsService } from '../notifications/app-notifications.service';
import { PartnerRegisterDto } from './dto/partner.dto';

@Injectable()
export class PartnerAuthService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Provider.name) private readonly providerModel: Model<ProviderDocument>,
    @InjectModel(ShareOrganisation.name)
    private readonly orgModel: Model<ShareOrganisationDocument>,
    private readonly authService: AuthService,
    private readonly auditLogService: AuditLogService,
    private readonly appNotificationsService: AppNotificationsService,
  ) {}

  private readonly logger = new Logger(PartnerAuthService.name);

  async register(dto: PartnerRegisterDto): Promise<AuthTokensResponseDto> {
    if (!dto.termsAccepted || !dto.privacyAccepted) {
      throw new BadRequestException('Terms and privacy policy must be accepted');
    }
    const email = dto.email.toLowerCase();
    if (await this.userModel.exists({ email })) {
      throw new ConflictException('An account with this email already exists');
    }

    const user = await this.userModel.create({
      fullName: dto.fullName,
      email,
      passwordHash: await bcrypt.hash(dto.password, 10),
      role: UserRole.PARTNER,
      status: UserStatus.ACTIVE,
      consent: {
        termsAccepted: true,
        privacyAccepted: true,
        healthDataProcessingAccepted: true,
        version: CURRENT_CONSENT_VERSION,
        acceptedAt: new Date(),
      },
    });

    const provider = await this.providerModel.create({
      name: dto.organisationName,
      type: dto.type,
      specialty: dto.specialty,
      email,
      phone: dto.phone,
      registrationNumber: dto.registrationNumber,
      qualifications: dto.qualifications ?? [],
      ownerUserId: user._id,
      // Not patient-visible until an admin approves (Admin A02 verification queue).
      status: ProviderStatus.PENDING,
    });

    // Lets patients grant this partner access to records from the Medical Vault sharing flow.
    await this.orgModel.create({
      name: dto.organisationName,
      type: dto.type === ProviderCategory.DIAGNOSTIC ? 'lab' : 'doctor',
      providerId: provider._id,
      // Only connected (and so grantable) once verified.
      connected: false,
    });

    await this.auditLogService.record({
      actorId: user.id,
      action: AuditAction.PARTNER_REGISTER,
      targetType: 'Provider',
      targetId: provider.id,
    });

    // Admin bell + verification queue badge (A02). Best-effort: sign-up must not fail on it.
    await this.appNotificationsService
      .notifyAdmins({
        trigger: 'partner_verification_requested',
        title: 'New partner awaiting approval',
        message: `${dto.organisationName} (${dto.type}) registered and is waiting for verification.`,
        lockScreenText: 'New partner awaiting approval',
        actionLabel: 'Review',
        actionRoute: '/admin/verification',
        actionParams: { providerId: provider.id },
      })
      .catch((err: Error) =>
        this.logger.error(`Failed to notify admins of partner ${provider.id}`, err.stack),
      );

    return this.authService.login({ email, password: dto.password });
  }
}
