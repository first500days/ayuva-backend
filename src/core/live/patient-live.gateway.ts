import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { TokenRevocationService } from '../../auth/services/token-revocation.service';
import { LiveBus } from '../../common/live/live-bus.service';
import { UserRole } from '../users/schemas/user.schema';
import { WsUpgradeRouter } from '../../partner/live/ws-upgrade-router.service';

export const PATIENT_LIVE_PATH = '/api/v1/me/live';

const AUTH_TIMEOUT_MS = 5_000;
const HEARTBEAT_MS = 30_000;
const MAX_PAYLOAD_BYTES = 2 * 1024;

interface Conn {
  ws: WebSocket;
  alive: boolean;
  userId?: string;
  authTimer?: NodeJS.Timeout;
  expiryTimer?: NodeJS.Timeout;
}

function rawText(data: RawData): string {
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  return Array.isArray(data)
    ? Buffer.concat(data).toString('utf8')
    : Buffer.from(data).toString('utf8');
}

/**
 * The patient app's live connection, open while the app is in the foreground:
 * small status messages about the person's own visits (e.g. "arrived", when
 * the clinic checks them in), so the home screen updates without a refresh.
 * The first message carries the access token. Messages carry ids and states,
 * never clinical content; the app re-reads details from the normal endpoints.
 */
@Injectable()
export class PatientLiveGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PatientLiveGateway.name);
  private readonly server = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_PAYLOAD_BYTES,
  });
  private readonly byUser = new Map<string, Set<Conn>>();
  private readonly conns = new Set<Conn>();
  private heartbeat?: NodeJS.Timeout;
  private offs: (() => void)[] = [];

  constructor(
    private readonly router: WsUpgradeRouter,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly bus: LiveBus,
    private readonly revocation: TokenRevocationService,
  ) {}

  onModuleInit(): void {
    this.router.add(PATIENT_LIVE_PATH, this.server);
    this.server.on('connection', (ws: WebSocket) => this.accept(ws));
    this.offs = [
      this.bus.onPatient((e) => {
        for (const c of this.byUser.get(e.userId) ?? [])
          this.send(c, e.message);
      }),
      this.bus.onSessionEnd((e) => {
        for (const c of this.byUser.get(e.userId) ?? [])
          c.ws.close(4403, e.reason);
      }),
    ];
    this.heartbeat = setInterval(() => this.beat(), HEARTBEAT_MS);
    this.heartbeat.unref();
  }

  onModuleDestroy(): void {
    this.offs.forEach((off) => off());
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const c of this.conns) c.ws.terminate();
    this.server.close();
  }

  private accept(ws: WebSocket): void {
    const conn: Conn = { ws, alive: true };
    this.conns.add(conn);
    conn.authTimer = setTimeout(
      () => ws.close(4401, 'auth timeout'),
      AUTH_TIMEOUT_MS,
    );
    ws.on('pong', () => (conn.alive = true));
    ws.on('message', (data: RawData) => void this.onMessage(conn, data));
    ws.on('close', () => this.drop(conn));
    ws.on('error', () => ws.terminate());
  }

  private async onMessage(conn: Conn, data: RawData): Promise<void> {
    let msg: { t?: unknown; token?: unknown };
    try {
      msg = JSON.parse(rawText(data)) as typeof msg;
    } catch {
      return;
    }
    if (msg.t !== 'auth' || conn.userId || typeof msg.token !== 'string')
      return;
    try {
      const p = await this.jwt.verifyAsync<
        JwtPayload & { exp?: number; iat?: number }
      >(msg.token, {
        secret: this.config.get<string>('jwt.accessSecret'),
      });
      if (p.role !== UserRole.PATIENT) throw new Error('not a patient');
      if (await this.revocation.isRevoked(p.sub, p.iat))
        throw new Error('revoked');
      if (conn.ws.readyState !== WebSocket.OPEN) return;
      if (conn.authTimer) clearTimeout(conn.authTimer);
      conn.userId = p.sub;
      let set = this.byUser.get(p.sub);
      if (!set) this.byUser.set(p.sub, (set = new Set()));
      set.add(conn);
      if (p.exp) {
        conn.expiryTimer = setTimeout(
          () => conn.ws.close(4401, 'token expired'),
          Math.max(0, p.exp * 1000 - Date.now()),
        );
        conn.expiryTimer.unref();
      }
      this.send(conn, { t: 'ready' });
    } catch {
      conn.ws.close(4401, 'unauthorized');
    }
  }

  private send(conn: Conn, msg: unknown): void {
    if (conn.ws.readyState === WebSocket.OPEN)
      conn.ws.send(JSON.stringify(msg));
  }

  private beat(): void {
    for (const c of this.conns) {
      if (!c.alive) {
        c.ws.terminate();
        continue;
      }
      c.alive = false;
      try {
        c.ws.ping();
      } catch (err) {
        this.logger.debug(`ping failed: ${String(err)}`);
      }
    }
  }

  private drop(conn: Conn): void {
    [conn.authTimer, conn.expiryTimer].forEach((t) => t && clearTimeout(t));
    this.conns.delete(conn);
    if (conn.userId) {
      const set = this.byUser.get(conn.userId);
      set?.delete(conn);
      if (set?.size === 0) this.byUser.delete(conn.userId);
    }
  }
}
