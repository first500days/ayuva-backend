import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
}

/** Isolated so AuthService can be unit-tested without a real Google network call. */
@Injectable()
export class GoogleAuthService {
  private readonly client = new OAuth2Client();
  private readonly audiences: string[];

  constructor(config: ConfigService) {
    this.audiences = [
      config.get<string>('googleOAuth.androidClientId'),
      config.get<string>('googleOAuth.webClientId'),
      config.get<string>('googleOAuth.iosClientId'),
    ].filter((id): id is string => !!id);
  }

  async verify(idToken: string): Promise<GoogleProfile> {
    if (this.audiences.length === 0) {
      throw new ServiceUnavailableException(
        'Google OAuth is not configured on this server',
      );
    }

    let payload;
    try {
      // Accepts any of the configured client IDs (Android/iOS/Web) as the
      // token's audience, since the mobile app can mint a token against
      // whichever one matches the platform it's running on (FR-1.3).
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.audiences,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Invalid Google ID token');
    }

    if (!payload?.email || !payload.sub) {
      throw new UnauthorizedException(
        'Google token did not include the required profile fields',
      );
    }

    return {
      sub: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified ?? false,
      name: payload.name,
    };
  }
}
