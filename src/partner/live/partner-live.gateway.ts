import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import {
  LiveBus,
  type LiveTopic,
  type VitalsFrame,
} from '../../common/live/live-bus.service';
import { Perm } from '../rbac/partner-permissions';
import {
  User,
  UserDocument,
  UserRole,
} from '../../core/users/schemas/user.schema';
import { PartnerContextService } from '../partner-context.service';
import { WsUpgradeRouter } from './ws-upgrade-router.service';

export const LIVE_PATH = '/api/v1/partner/live';

/** Close codes the portal acts on. */
export const LIVE_CLOSE = {
  /** No or expired token: refresh it and reconnect. */
  UNAUTHORIZED: 4401,
  /** The account was frozen or suspended: sign out. */
  FROZEN: 4403,
  /** This login signed in somewhere else: sign out. */
  REPLACED: 4409,
} as const;

const AUTH_TIMEOUT_MS = 5_000;
const HEARTBEAT_MS = 30_000;
/** A burst of writes (a bulk import, say) reaches each browser as one refresh. */
const COALESCE_MS = 120;
const MAX_PAYLOAD_BYTES = 16 * 1024;
const MAX_WATCHED = 500;
const MAX_BUFFERED_BYTES = 256 * 1024;

interface Conn {
  ws: WebSocket;
  alive: boolean;
  authTimer?: NodeJS.Timeout;
  expiryTimer?: NodeJS.Timeout;
  flushTimer?: NodeJS.Timeout;
  pending: Set<LiveTopic>;
  userId?: string;
  providerId?: string;
  /** Clinical staff only: may receive bedside telemetry. */
  canWatch?: boolean;
  watching?: Set<string> | 'all';
}

function rawText(data: RawData): string {
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  return Array.isArray(data)
    ? Buffer.concat(data).toString('utf8')
    : Buffer.from(data).toString('utf8');
}

/**
 * Staff browsers' live connection: "this area changed, re-read it". Browsers
 * fetch the data itself from the normal endpoints, where permissions and
 * access logging already apply. The one exception is bedside telemetry, sent
 * to clinical staff who ask for it: numbers keyed by admission id, no names.
 *
 * Browsers can't set headers on a WebSocket, and a token in the URL would end
 * up in proxy logs, so the first message carries the access token.
 */
@Injectable()
export class PartnerLiveGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PartnerLiveGateway.name);
  private readonly server = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_PAYLOAD_BYTES,
  });
  private readonly byProvider = new Map<string, Set<Conn>>();
  private readonly byUser = new Map<string, Set<Conn>>();
  private readonly conns = new Set<Conn>();
  private heartbeat?: NodeJS.Timeout;
  private unsubscribe: (() => void)[] = [];

  constructor(
    private readonly router: WsUpgradeRouter,
    private readonly bus: LiveBus,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly context: PartnerContextService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  onModuleInit(): void {
    this.router.add(LIVE_PATH, this.server);
    this.server.on('connection', (ws: WebSocket) => this.accept(ws));
    this.unsubscribe = [
      this.bus.onChange((e) => this.notifyProvider(e.providerId, e.topics)),
      this.bus.onFrame((f) => this.forwardFrame(f)),
      this.bus.onSessionEnd((e) =>
        this.closeUser(
          e.userId,
          e.reason === 'session_replaced'
            ? LIVE_CLOSE.REPLACED
            : LIVE_CLOSE.FROZEN,
          e.reason,
        ),
      ),
    ];
    this.heartbeat = setInterval(() => this.beat(), HEARTBEAT_MS);
    this.heartbeat.unref();
  }

  onModuleDestroy(): void {
    this.unsubscribe.forEach((off) => off());
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const c of this.conns) c.ws.terminate();
    this.server.close();
  }

  private accept(ws: WebSocket): void {
    const conn: Conn = { ws, alive: true, pending: new Set() };
    this.conns.add(conn);
    conn.authTimer = setTimeout(
      () => ws.close(LIVE_CLOSE.UNAUTHORIZED, 'auth timeout'),
      AUTH_TIMEOUT_MS,
    );
    ws.on('pong', () => (conn.alive = true));
    ws.on('message', (data: RawData) => void this.onMessage(conn, data));
    ws.on('close', () => this.drop(conn));
    ws.on('error', () => ws.terminate());
  }

  private async onMessage(conn: Conn, data: RawData): Promise<void> {
    let msg: { t?: unknown; token?: unknown; admissions?: unknown };
    try {
      msg = JSON.parse(rawText(data)) as typeof msg;
    } catch {
      return;
    }
    if (msg.t === 'auth' && !conn.userId && typeof msg.token === 'string')
      await this.authenticate(conn, msg.token);
    else if (msg.t === 'watch' && conn.canWatch)
      conn.watching =
        msg.admissions === 'all'
          ? 'all'
          : new Set(
              (Array.isArray(msg.admissions) ? msg.admissions : [])
                .filter((a): a is string => typeof a === 'string')
                .slice(0, MAX_WATCHED),
            );
  }

  private forwardFrame({ providerId, ...frame }: VitalsFrame): void {
    for (const conn of this.byProvider.get(providerId) ?? []) {
      const wanted =
        conn.watching === 'all' || conn.watching?.has(frame.admissionId);
      // A browser that can't keep up skips frames rather than queueing them.
      if (wanted && conn.ws.bufferedAmount < MAX_BUFFERED_BYTES)
        this.send(conn, { t: 'vitals', ...frame });
    }
  }

  private async authenticate(conn: Conn, token: string): Promise<void> {
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload & { exp?: number }>(
        token,
        { secret: this.config.get<string>('jwt.accessSecret') },
      );
      if (payload.role !== UserRole.PARTNER) throw new Error('not a partner');
      const user = await this.userModel
        .findById(payload.sub)
        .select('partnerSessionId')
        .lean()
        .exec();
      if (user?.partnerSessionId && user.partnerSessionId !== payload.sid) {
        conn.ws.close(LIVE_CLOSE.REPLACED, 'session_replaced');
        return;
      }
      const ctx = await this.context.requireLiveContext(payload.sub);
      if (conn.ws.readyState !== WebSocket.OPEN) return;

      if (conn.authTimer) clearTimeout(conn.authTimer);
      conn.userId = payload.sub;
      conn.providerId = ctx.provider.id;
      conn.canWatch = ctx.permissions.includes(Perm.TELEMETRY_VIEW);
      this.index(this.byProvider, conn.providerId, conn);
      this.index(this.byUser, conn.userId, conn);
      // The token's lifetime is the connection's: the portal refreshes and reconnects.
      if (payload.exp) {
        conn.expiryTimer = setTimeout(
          () => conn.ws.close(LIVE_CLOSE.UNAUTHORIZED, 'token expired'),
          Math.max(0, payload.exp * 1000 - Date.now()),
        );
        conn.expiryTimer.unref();
      }
      this.send(conn, { t: 'ready' });
    } catch {
      conn.ws.close(LIVE_CLOSE.UNAUTHORIZED, 'unauthorized');
    }
  }

  private notifyProvider(providerId: string, topics: LiveTopic[]): void {
    for (const conn of this.byProvider.get(providerId) ?? []) {
      topics.forEach((t) => conn.pending.add(t));
      conn.flushTimer ??= setTimeout(() => this.flush(conn), COALESCE_MS);
    }
  }

  private flush(conn: Conn): void {
    conn.flushTimer = undefined;
    if (!conn.pending.size) return;
    this.send(conn, { t: 'inv', topics: [...conn.pending] });
    conn.pending.clear();
  }

  private closeUser(userId: string, code: number, reason: string): void {
    for (const conn of this.byUser.get(userId) ?? [])
      conn.ws.close(code, reason);
  }

  private send(conn: Conn, msg: unknown): void {
    if (conn.ws.readyState === WebSocket.OPEN)
      conn.ws.send(JSON.stringify(msg));
  }

  /** Ping everyone; a connection that missed the last ping is gone. Also keeps proxies from idling it out. */
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
    [conn.authTimer, conn.expiryTimer, conn.flushTimer].forEach(
      (t) => t && clearTimeout(t),
    );
    this.conns.delete(conn);
    if (conn.providerId) this.unindex(this.byProvider, conn.providerId, conn);
    if (conn.userId) this.unindex(this.byUser, conn.userId, conn);
  }

  private index(map: Map<string, Set<Conn>>, key: string, conn: Conn): void {
    let set = map.get(key);
    if (!set) map.set(key, (set = new Set()));
    set.add(conn);
  }

  private unindex(map: Map<string, Set<Conn>>, key: string, conn: Conn): void {
    const set = map.get(key);
    set?.delete(conn);
    if (set?.size === 0) map.delete(key);
  }
}
