import { isLocalIp, normaliseIp } from '../../common/request-context/client-ip';

/**
 * The network an address belongs to, coarse enough that a phone hopping
 * between addresses on the same carrier or office line still reads as one:
 * IPv4 /24, IPv6 /48. Null for private, loopback or missing addresses.
 */
export function networkOf(raw: string | undefined | null): string | null {
  const ip = normaliseIp(raw);
  if (!ip || isLocalIp(ip)) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip))
    return `${ip.split('.').slice(0, 3).join('.')}.x`;
  if (ip.includes(':')) {
    const parts = ip.toLowerCase().split(':').filter(Boolean);
    return parts.length >= 3 ? `${parts.slice(0, 3).join(':')}::/48` : null;
  }
  return null;
}

export interface NetworkHistory {
  /** When this actor was first seen on this network. */
  firstSeen: Date;
}

/**
 * A row is from an unrecognised network when it is the actor's first event on
 * that network and the actor already had history on other networks before it
 * (so a brand-new account's first sign-in is not flagged).
 */
export function isUnrecognised(
  at: Date,
  network: string | null,
  history: Map<string, NetworkHistory>,
): boolean {
  if (!network) return false;
  const mine = history.get(network);
  if (!mine || Math.abs(mine.firstSeen.getTime() - at.getTime()) > 1000)
    return false;
  for (const [other, h] of history)
    if (other !== network && h.firstSeen.getTime() < at.getTime()) return true;
  return false;
}
