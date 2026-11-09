import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { WsUpgradeRouter } from '../live/ws-upgrade-router.service';
import {
  type IncomingFrame,
  type LiveMonitor,
  PartnerTelemetryService,
} from './partner-telemetry.service';

export const TELEMETRY_INGEST_PATH = '/api/v1/partner/telemetry/ingest';

const AUTH_TIMEOUT_MS = 5_000;
const MAX_PAYLOAD_BYTES = 64 * 1024;
/** Devices normally send a few frames a second; beyond this they're dropped. */
const MAX_FRAMES_PER_SECOND = 50;
const CLOSE_UNAUTHORIZED = 4401;

/**
 * Where monitors, telemetry gateways and wearable hubs send vitals. A device
 * authenticates with its key in the first message, then streams
 * `{ t: "f", hr, spo2, rr, ecg: [...], fs }`.
 */
@Injectable()
export class TelemetryIngestGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelemetryIngestGateway.name);
  private readonly server = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_PAYLOAD_BYTES,
  });

  constructor(
    private readonly router: WsUpgradeRouter,
    private readonly telemetry: PartnerTelemetryService,
  ) {}

  onModuleInit(): void {
    this.router.add(TELEMETRY_INGEST_PATH, this.server);
    this.server.on('connection', (ws: WebSocket) => this.accept(ws));
  }

  onModuleDestroy(): void {
    for (const c of this.server.clients) c.terminate();
    this.server.close();
  }

  private accept(ws: WebSocket): void {
    let monitor: LiveMonitor | null = null;
    let authing = false;
    let windowStart = 0;
    let inWindow = 0;
    const timer = setTimeout(
      () => ws.close(CLOSE_UNAUTHORIZED, 'auth timeout'),
      AUTH_TIMEOUT_MS,
    );
    ws.on('error', () => ws.terminate());
    ws.on('close', () => clearTimeout(timer));
    ws.on('message', (data: RawData) => {
      let msg: IncomingFrame & { t?: unknown; key?: unknown };
      try {
        msg = JSON.parse(rawText(data)) as typeof msg;
      } catch {
        return;
      }
      if (!monitor) {
        if (msg.t !== 'auth' || typeof msg.key !== 'string' || authing) return;
        authing = true;
        void this.telemetry
          .connectDevice(msg.key)
          .then((m) => {
            authing = false;
            if (!m) {
              ws.close(CLOSE_UNAUTHORIZED, 'unknown key');
              return;
            }
            clearTimeout(timer);
            monitor = m;
            ws.send(JSON.stringify({ t: 'ready' }));
          })
          .catch((err: Error) => {
            this.logger.error('Device sign-in failed', err.stack);
            ws.close(1011, 'server error');
          });
        return;
      }
      if (msg.t !== 'f') return;
      const now = Date.now();
      if (now - windowStart >= 1000) {
        windowStart = now;
        inWindow = 0;
      }
      if (++inWindow > MAX_FRAMES_PER_SECOND) return;
      this.telemetry
        .ingest(monitor, msg)
        .catch((err: Error) =>
          this.logger.error('Telemetry frame failed', err.stack),
        );
    });
  }
}

function rawText(data: RawData): string {
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  return Array.isArray(data)
    ? Buffer.concat(data).toString('utf8')
    : Buffer.from(data).toString('utf8');
}
