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
  name?: string;
}

/** Isolated so AuthService can be unit-tested without a real Google network call. */
@Injectable()
export class GoogleAuthService {
  private readonly client: OAuth2Client;
  private readonly clientId?: string;

  constructor(config: ConfigService) {
    this.clientId = config.get<string>('googleOAuth.clientId');
    this.client = new OAuth2Client(this.clientId);
  }

  async verify(idToken: string): Promise<GoogleProfile> {
    if (!this.clientId) {
      throw new ServiceUnavailableException(
        'Google OAuth is not configured on this server',
      );
    }

    let payload;
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.clientId,
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

    return { sub: payload.sub, email: payload.email, name: payload.name };
  }
}
