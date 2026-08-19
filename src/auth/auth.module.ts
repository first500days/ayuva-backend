import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ConsentGuard } from './guards/consent.guard';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { GoogleAuthService } from './services/google-auth.service';
import { User, UserSchema } from '../core/users/schemas/user.schema';
import {
  HealthProfile,
  HealthProfileSchema,
} from '../core/health-profile/schemas/health-profile.schema';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    PassportModule,
    AuditLogModule,
    MailModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: HealthProfile.name, schema: HealthProfileSchema },
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.accessSecret'),
        signOptions: {
          expiresIn: config.get<string>('jwt.accessExpiresIn'),
        } as JwtSignOptions,
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [JwtStrategy, JwtAuthGuard, ConsentGuard, AuthService, GoogleAuthService],
  exports: [
    JwtModule,
    PassportModule,
    JwtAuthGuard,
    ConsentGuard,
    MongooseModule,
  ],
})
export class AuthModule {}
