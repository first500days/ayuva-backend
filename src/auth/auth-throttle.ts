import { applyDecorators, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

const limit = (perMinute: number) =>
  applyDecorators(
    UseGuards(ThrottlerGuard),
    Throttle({ default: { limit: perMinute, ttl: 60_000 } }),
  );

/**
 * Requests per minute from one address. A whole hospital can share an address
 * at shift change, so sign-in stays roomy; each account has its own lockout.
 */
export const SignInLimit = () => limit(30);
export const CodeLimit = () => limit(10);
export const RefreshLimit = () => limit(240);
export const PublicLinkLimit = () => limit(60);
