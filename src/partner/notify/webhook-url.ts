import { BadRequestException } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Webhook URLs are supplied by partners and fetched by this server, so they
 * are an SSRF vector: refuse anything that resolves to loopback, private,
 * link-local (cloud metadata) or otherwise non-public addresses. Checked when
 * the URL is saved and again before each delivery. A DNS answer could still
 * change between the check and the request (rebinding); egress filtering at
 * the network layer is the complete fix.
 *
 * `allowPrivate` is for local development only (http://localhost receivers).
 */
export async function assertSafeWebhookUrl(
  raw: string,
  allowPrivate: boolean,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BadRequestException('Webhook URL is not a valid URL');
  }
  if (
    url.protocol !== 'https:' &&
    !(allowPrivate && url.protocol === 'http:')
  ) {
    throw new BadRequestException('Webhook URL must use https://');
  }
  if (url.username || url.password) {
    throw new BadRequestException('Webhook URL must not contain credentials');
  }
  if (allowPrivate) return url;

  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    throw new BadRequestException('Webhook URL must point to a public host');
  }
  let addresses: string[];
  try {
    addresses = isIP(host)
      ? [host]
      : (await lookup(host, { all: true, verbatim: true })).map(
          (a) => a.address,
        );
  } catch {
    throw new BadRequestException(
      `Webhook host "${host}" could not be resolved`,
    );
  }
  if (addresses.length === 0 || addresses.some(isNonPublicAddress)) {
    throw new BadRequestException('Webhook URL must point to a public address');
  }
  return url;
}

/** True for loopback, private, CGNAT, link-local, multicast, reserved and unspecified ranges. */
export function isNonPublicAddress(address: string): boolean {
  const ip = address.toLowerCase();
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isNonPublicAddress(mapped[1]);

  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (isIP(ip) === 6) {
    return (
      ip === '::' ||
      ip === '::1' ||
      ip.startsWith('fc') ||
      ip.startsWith('fd') ||
      /^fe[89ab]/.test(ip) ||
      ip.startsWith('ff')
    );
  }
  return true;
}
