import type { NextFunction, Request, Response } from 'express';

/** Normalise an origin for comparison: trim, lowercase, no trailing slash. */
export const normalizeOrigin = (o: string): string =>
  o.trim().toLowerCase().replace(/\/+$/, '');

/** Parse the comma-separated CORS_ALLOWED_ORIGINS value. */
export function parseAllowedOrigins(raw?: string): string[] {
  return (raw ?? '').split(',').map(normalizeOrigin).filter(Boolean);
}

/** Exact match against the allowlist. No wildcards, no suffix matching. */
export function isOriginAllowed(
  origin: string | undefined,
  allowed: string[],
): boolean {
  return !!origin && allowed.includes(normalizeOrigin(origin));
}

/** Routes that are credentialed by a single-use link, not by the caller's origin. */
const EXEMPT_PATHS = ['/health', '/api/v1/scan-view'];

/**
 * Production browser lock. CORS only hides responses; this stops the request
 * itself. A request carrying an Origin that is not one of our frontends gets
 * 403 before any controller runs. Requests with no Origin (mobile app,
 * server-to-server, ALB health checks) pass; they authenticate with JWT.
 * Browsers that omit Origin on same-site-less GETs are caught by Sec-Fetch-Site.
 */
export function originGuardMiddleware(allowed: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (EXEMPT_PATHS.includes(req.path)) return next();
    const origin = req.headers.origin;
    if (origin) {
      if (isOriginAllowed(origin, allowed)) return next();
      res.status(403).json({ message: 'Origin not allowed' });
      return;
    }
    if (req.headers['sec-fetch-site'] === 'cross-site') {
      res.status(403).json({ message: 'Origin not allowed' });
      return;
    }
    next();
  };
}
