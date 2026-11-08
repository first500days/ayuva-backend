import { Logger } from '@nestjs/common';
import { FcmPayload, FcmSender, PushTokenGoneError } from './fcm-sender.interface';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const TIMEOUT_MS = 10_000;

export const isExpoPushToken = (token: string) =>
  /^Expo(nent)?PushToken\[.+\]$/.test(token);

interface ExpoTicket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

/**
 * Delivers to Expo push tokens, which the iOS app registers because it has no
 * Firebase set-up of its own. Firebase rejects these tokens outright.
 */
export class ExpoPushSender implements FcmSender {
  private readonly logger = new Logger(ExpoPushSender.name);

  constructor(private readonly accessToken?: string) {}

  send(token: string, payload: FcmPayload): Promise<void> {
    return this.post(token, payload, false);
  }

  sendAndWake(token: string, payload: FcmPayload): Promise<void> {
    return this.post(token, payload, true);
  }

  private async post(
    token: string,
    payload: FcmPayload,
    wake: boolean,
  ): Promise<void> {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(this.accessToken && {
          Authorization: `Bearer ${this.accessToken}`,
        }),
      },
      body: JSON.stringify({
        to: token,
        title: payload.title,
        body: payload.body,
        data: payload.data ?? {},
        sound: 'default',
        priority: 'high',
        ...(wake && { contentAvailable: true }),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      this.logger.error(`Expo push failed: HTTP ${res.status}`);
      throw new Error(`Expo push failed: HTTP ${res.status}`);
    }
    const json = (await res.json()) as { data?: ExpoTicket | ExpoTicket[] };
    const ticket = Array.isArray(json.data) ? json.data[0] : json.data;
    if (ticket?.status !== 'error') return;
    if (ticket.details?.error === 'DeviceNotRegistered')
      throw new PushTokenGoneError();
    throw new Error(
      `Expo push rejected: ${ticket.details?.error ?? ticket.message ?? 'unknown'}`,
    );
  }
}
