import { ExceptionWatchService } from './exception-watch.service';
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
import { canUseAdminModule } from '../../common/admin-modules';
import { LiveBus } from '../../common/live/live-bus.service';
import { logTap, type TappedLine } from '../../common/observability/log-tap';
import { UserRole } from '../../core/users/schemas/user.schema';
import { TokenRevocationService } from '../../auth/services/token-revocation.service';
import { WsUpgradeRouter } from '../../partner/live/ws-upgrade-router.service';
import { NODE_LOG_CONTEXTS } from './system-pulse';
import { SystemPulseService } from './system-pulse.service';

export const ADMIN_LIVE_PATH = '/api/v1/admin/live';

export const ADMIN_LIVE_CLOSE = {
  UNAUTHORIZED: 4401,
  /** Sessions ended by an administrator ("Terminate web tokens"). */
  REVOKED: 4403,
} as const;

/** The graph's refresh rate. */
export const PULSE_MS = 500;
const AUTH_TIMEOUT_MS = 5_000;
const HEARTBEAT_MS = 30_000;
const MAX_PAYLOAD_BYTES = 4 * 1024;
const MAX_BUFFERED_BYTES = 256 * 1024;
const BACKLOG_LINES = 80;

interface Conn {
  ws: WebSocket;
  alive: boolean;
  authTimer?: NodeJS.Timeout;
  expiryTimer?: NodeJS.Timeout;
  userId?: string;
  canLogs?: boolean;
  /** The node whose logs this admin is tailing. */
  tail?: { node: string; match: RegExp };
}

function rawText(data: RawData): string {
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  return Array.isArray(data)
    ? Buffer.concat(data).toString('utf8')
    : Buffer.from(data).toString('utf8');
}

/**
 * The Admin Panel's live connection: the system graph twice a second while
 * an admin has it open, and, for admins who run Operations, a live tail of
 * the (redacted) application log for the service they are investigating.
 * The first message carries the access token, as on the partner socket.
 */
@Injectable()
export class AdminLiveGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AdminLiveGateway.name);
  private readonly server = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_PAYLOAD_BYTES,
  });
  private readonly conns = new Set<Conn>();
  private ticker?: NodeJS.Timeout;
  private heartbeat?: NodeJS.Timeout;
  private offs: (() => void)[] = [];

  constructor(
    private readonly router: WsUpgradeRouter,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly pulse: SystemPulseService,
    private readonly bus: LiveBus,
    private readonly revocation: TokenRevocationService,
    private readonly exceptions: ExceptionWatchService,
  ) {}

  onModuleInit(): void {
    this.router.add(ADMIN_LIVE_PATH, this.server);
    this.server.on('connection', (ws: WebSocket) => this.accept(ws));
    this.offs = [
      logTap.onLine((l) => this.forwardLine(l)),
      // Items unaddressed for 15 minutes become alerts on every open admin screen.
      this.exceptions.onChange((items, fresh) => {
        for (const c of this.conns)
          if (c.userId) this.send(c, { t: 'exceptions', items, fresh });
      }),
      this.bus.onSessionEnd((e) => {
        for (const c of this.conns)
          if (c.userId === e.userId)
            c.ws.close(ADMIN_LIVE_CLOSE.REVOKED, e.reason);
      }),
    ];
    this.heartbeat = setInterval(() => this.beat(), HEARTBEAT_MS);
    this.heartbeat.unref();
  }

  onModuleDestroy(): void {
    this.offs.forEach((off) => off());
    if (this.ticker) clearInterval(this.ticker);
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const c of this.conns) c.ws.terminate();
    this.server.close();
  }

  private accept(ws: WebSocket): void {
    const conn: Conn = { ws, alive: true };
    this.conns.add(conn);
    conn.authTimer = setTimeout(
      () => ws.close(ADMIN_LIVE_CLOSE.UNAUTHORIZED, 'auth timeout'),
      AUTH_TIMEOUT_MS,
    );
    ws.on('pong', () => (conn.alive = true));
    ws.on('message', (data: RawData) => void this.onMessage(conn, data));
    ws.on('close', () => this.drop(conn));
    ws.on('error', () => ws.terminate());
  }

  private async onMessage(conn: Conn, data: RawData): Promise<void> {
    let msg: { t?: unknown; token?: unknown; node?: unknown };
    try {
      msg = JSON.parse(rawText(data)) as typeof msg;
    } catch {
      return;
    }
    if (msg.t === 'auth' && !conn.userId && typeof msg.token === 'string')
      await this.authenticate(conn, msg.token);
    else if (msg.t === 'logs' && conn.userId) this.setTail(conn, msg.node);
  }

  private async authenticate(conn: Conn, token: string): Promise<void> {
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload & { exp?: number }>(
        token,
        { secret: this.config.get<string>('jwt.accessSecret') },
      );
      if (payload.role !== UserRole.ADMIN || payload.mfa !== true)
        throw new Error('not an admin');
      if (
        await this.revocation.isRevoked(
          payload.sub,
          (payload as { iat?: number }).iat,
        )
      ) {
        conn.ws.close(ADMIN_LIVE_CLOSE.REVOKED, 'tokens_revoked');
        return;
      }
      if (conn.ws.readyState !== WebSocket.OPEN) return;
      if (conn.authTimer) clearTimeout(conn.authTimer);
      conn.userId = payload.sub;
      conn.canLogs = canUseAdminModule(payload.perms ?? [], 'operations');
      if (payload.exp) {
        conn.expiryTimer = setTimeout(
          () => conn.ws.close(ADMIN_LIVE_CLOSE.UNAUTHORIZED, 'token expired'),
          Math.max(0, payload.exp * 1000 - Date.now()),
        );
        conn.expiryTimer.unref();
      }
      this.send(conn, { t: 'ready', canLogs: conn.canLogs, everyMs: PULSE_MS });
      this.counted();
      this.send(conn, { t: 'pulse', ...this.pulse.sample() });
      void this.exceptions
        .current()
        .then((items) => this.send(conn, { t: 'exceptions', items, fresh: [] }))
        .catch(() => undefined);
    } catch {
      conn.ws.close(ADMIN_LIVE_CLOSE.UNAUTHORIZED, 'unauthorized');
    }
  }

  private setTail(conn: Conn, node: unknown): void {
    if (node === null) {
      conn.tail = undefined;
      return;
    }
    if (!conn.canLogs || typeof node !== 'string') return;
    const match = NODE_LOG_CONTEXTS[node];
    if (!match) return;
    conn.tail = { node, match };
    this.send(conn, {
      t: 'logs.backlog',
      node,
      lines: logTap.recent((l) => match.test(l.context), BACKLOG_LINES),
    });
  }

  private forwardLine(line: TappedLine): void {
    for (const c of this.conns) {
      if (!c.tail || !c.tail.match.test(line.context)) continue;
      if (c.ws.bufferedAmount < MAX_BUFFERED_BYTES)
        this.send(c, { t: 'log', node: c.tail.node, line });
    }
  }

  /** Runs the graph while anyone is watching, stops it when nobody is. */
  private counted(): void {
    const watching = [...this.conns].filter((c) => c.userId).length;
    this.pulse.setAdminSockets(watching);
    if (watching && !this.ticker) {
      this.ticker = setInterval(() => this.tick(), PULSE_MS);
      this.ticker.unref();
    } else if (!watching && this.ticker) {
      clearInterval(this.ticker);
      this.ticker = undefined;
    }
  }

  private tick(): void {
    const frame = JSON.stringify({ t: 'pulse', ...this.pulse.sample() });
    for (const c of this.conns) {
      // A browser that falls behind skips frames rather than queueing them.
      if (
        c.userId &&
        c.ws.readyState === WebSocket.OPEN &&
        c.ws.bufferedAmount < MAX_BUFFERED_BYTES
      )
        c.ws.send(frame);
    }
  }

  private send(conn: Conn, msg: unknown): void {
    if (conn.ws.readyState === WebSocket.OPEN)
      conn.ws.send(JSON.stringify(msg));
  }

  private beat(): void {
    for (const conn of this.conns) {
      if (!conn.alive) {
        conn.ws.terminate();
        continue;
      }
      conn.alive = false;
      try {
        conn.ws.ping();
      } catch (err) {
        this.logger.debug(`ping failed: ${String(err)}`);
      }
    }
  }

  private drop(conn: Conn): void {
    [conn.authTimer, conn.expiryTimer].forEach((t) => t && clearTimeout(t));
    this.conns.delete(conn);
    this.counted();
  }
}
