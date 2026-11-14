import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

const PRIVATE_V4 =
  /^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/;

/** Strips the IPv6 wrapper around IPv4 and any port, so "::ffff:1.2.3.4" becomes "1.2.3.4". */
export function normaliseIp(raw: string | undefined | null): string | undefined {
  let ip = (raw ?? '').trim();
  if (!ip) return undefined;
  ip = ip.replace(/^::ffff:/i, '');
  const v4port = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(ip);
  if (v4port) ip = v4port[1];
  return ip;
}

/** 127.x, ::1 and ::: this machine, never the caller. Never stored in audit records. */
export function isLoopbackIp(ip: string | undefined): boolean {
  const v = (ip ?? '').toLowerCase();
  return v === '::1' || v === '::' || v.startsWith('127.') || v === 'localhost';
}

/** For display: a stored address, or nothing when it was only ever a loopback string. */
export function displayIp(raw: string | undefined | null): string | undefined {
  const ip = normaliseIp(raw);
  return ip && !isLoopbackIp(ip) ? ip : undefined;
}

/** Loopback and private ranges: never a real device address. */
export function isLocalIp(ip: string | undefined): boolean {
  if (!ip) return true;
  const v = ip.toLowerCase();
  return (
    v === '::1' ||
    v === '::' ||
    v.startsWith('fe80:') ||
    v.startsWith('fc') ||
    v.startsWith('fd') ||
    PRIVATE_V4.test(v)
  );
}

/**
 * The caller's public address. With `trust proxy` set, Express already reads the
 * right x-forwarded-for hop into req.ip; this also covers a proxy chain where that
 * hop is private by taking the first public x-forwarded-for entry.
 */
export function clientIp(req: Pick<Request, 'ip' | 'headers'>): string | undefined {
  const direct = normaliseIp(req.ip);
  if (direct && !isLocalIp(direct)) return direct;
  const header = req.headers?.['x-forwarded-for'];
  const chain = (Array.isArray(header) ? header.join(',') : (header ?? ''))
    .split(',')
    .map((p) => normaliseIp(p))
    .filter((p): p is string => !!p);
  return chain.find((p) => !isLocalIp(p)) ?? direct;
}

const store = new AsyncLocalStorage<{ ip?: string }>();

/** Makes the caller's IP available to anything running inside the request, e.g. audit writes. */
export function requestContextMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  store.run({ ip: clientIp(req) }, next);
}

export function currentIp(): string | undefined {
  return store.getStore()?.ip;
}
