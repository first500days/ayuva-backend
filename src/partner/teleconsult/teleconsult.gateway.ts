import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { WsUpgradeRouter } from '../live/ws-upgrade-router.service';
import {
  PartnerTeleconsultService,
  type JoinClaims,
} from './partner-teleconsult.service';

export const TELECONSULT_PATH = '/api/v1/teleconsult';
// WebRTC offers/answers and ICE candidates are small; anything bigger is refused.
const MAX_PAYLOAD_BYTES = 64 * 1024;
const JOIN_TIMEOUT_MS = 10_000;
const HEARTBEAT_MS = 25_000;
export const CALL_CLOSE = {
  UNAUTHORIZED: 4401,
  REPLACED: 4409,
  ENDED: 4410,
} as const;

function rawText(data: RawData): string {
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  return Array.isArray(data)
    ? Buffer.concat(data).toString('utf8')
    : Buffer.from(data).toString('utf8');
}

interface Seat {
  ws: WebSocket;
  alive: boolean;
  claims?: JoinClaims;
  joinTimer?: NodeJS.Timeout;
}

/**
 * Signalling for video consultations: each room holds one doctor and one
 * patient, and the server passes their WebRTC offer, answer and network
 * candidates to the other side. Audio and video never come through here.
 * The first message carries the join token (a URL would end up in logs).
 */
@Injectable()
export class TeleconsultGateway implements OnModuleInit, OnModuleDestroy {
  private readonly server = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_PAYLOAD_BYTES,
  });
  private readonly rooms = new Map<string, { doctor?: Seat; patient?: Seat }>();
  private readonly seats = new Set<Seat>();
  private heartbeat?: NodeJS.Timeout;
  private offEnd?: () => void;

  constructor(
    private readonly router: WsUpgradeRouter,
    private readonly calls: PartnerTeleconsultService,
  ) {}

  onModuleInit(): void {
    this.router.add(TELECONSULT_PATH, this.server);
    this.server.on('connection', (ws: WebSocket) => this.accept(ws));
    this.offEnd = this.calls.onEnd((callId) => this.closeRoom(callId));
    this.heartbeat = setInterval(() => {
      for (const s of this.seats) {
        if (!s.alive) s.ws.terminate();
        else {
          s.alive = false;
          s.ws.ping();
        }
      }
    }, HEARTBEAT_MS);
    this.heartbeat.unref();
  }

  onModuleDestroy(): void {
    this.offEnd?.();
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const s of this.seats) s.ws.terminate();
    this.server.close();
  }

  private accept(ws: WebSocket): void {
    const seat: Seat = { ws, alive: true };
    this.seats.add(seat);
    seat.joinTimer = setTimeout(
      () => ws.close(CALL_CLOSE.UNAUTHORIZED, 'join timeout'),
      JOIN_TIMEOUT_MS,
    );
    ws.on('pong', () => (seat.alive = true));
    ws.on('message', (data: RawData) => void this.onMessage(seat, data));
    ws.on('close', () => this.leave(seat));
    ws.on('error', () => ws.terminate());
  }

  private async onMessage(seat: Seat, data: RawData): Promise<void> {
    let msg: { t?: unknown; token?: unknown; data?: unknown };
    try {
      msg = JSON.parse(rawText(data)) as typeof msg;
    } catch {
      return;
    }
    if (msg.t === 'join' && !seat.claims && typeof msg.token === 'string')
      return this.join(seat, msg.token);
    const claims = seat.claims;
    if (!claims) return;
    const room = this.rooms.get(claims.callId);
    const other = claims.role === 'doctor' ? room?.patient : room?.doctor;
    if (msg.t === 'signal') {
      // Offer / answer / candidate: passed on as they are, to the other person only.
      if (other) this.send(other, { t: 'signal', data: msg.data });
    } else if (msg.t === 'end' && claims.role === 'doctor') {
      await this.calls.markEnded(claims.callId);
    }
  }

  private async join(seat: Seat, token: string): Promise<void> {
    const claims = await this.calls.admit(token);
    if (!claims) {
      seat.ws.close(CALL_CLOSE.UNAUTHORIZED, 'invalid or expired link');
      return;
    }
    clearTimeout(seat.joinTimer);
    seat.claims = claims;
    const room = this.rooms.get(claims.callId) ?? {};
    const previous = room[claims.role];
    // The same person opening the call again (another tab, a reload) takes the seat.
    if (previous && previous !== seat) {
      previous.claims = undefined;
      previous.ws.close(CALL_CLOSE.REPLACED, 'joined from another window');
    }
    room[claims.role] = seat;
    this.rooms.set(claims.callId, room);
    const other = claims.role === 'doctor' ? room.patient : room.doctor;
    this.send(seat, {
      t: 'joined',
      role: claims.role,
      peer: other?.claims
        ? { role: other.claims.role, name: other.claims.name }
        : null,
    });
    if (other?.claims)
      this.send(other, {
        t: 'peer.joined',
        role: claims.role,
        name: claims.name,
      });
    if (claims.role === 'patient')
      await this.calls.patientJoined(claims.callId);
  }

  private leave(seat: Seat): void {
    clearTimeout(seat.joinTimer);
    this.seats.delete(seat);
    const claims = seat.claims;
    if (!claims) return;
    const room = this.rooms.get(claims.callId);
    if (!room || room[claims.role] !== seat) return;
    delete room[claims.role];
    const other = claims.role === 'doctor' ? room.patient : room.doctor;
    if (other) this.send(other, { t: 'peer.left', role: claims.role });
    if (!room.doctor && !room.patient) this.rooms.delete(claims.callId);
  }

  private closeRoom(callId: string): void {
    const room = this.rooms.get(callId);
    if (!room) return;
    for (const seat of [room.doctor, room.patient]) {
      if (!seat) continue;
      this.send(seat, { t: 'ended' });
      seat.ws.close(CALL_CLOSE.ENDED, 'consultation ended');
    }
    this.rooms.delete(callId);
  }

  private send(seat: Seat, msg: unknown): void {
    if (seat.ws.readyState === WebSocket.OPEN)
      seat.ws.send(JSON.stringify(msg));
  }
}
