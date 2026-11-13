import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';

/**
 * What changed, by area. Subscribers re-read the matching REST endpoints, so
 * nothing but these words crosses the socket: each person's own permissions
 * and record-access logging still decide what they see.
 */
export type LiveTopic =
  | 'appointments'
  | 'census'
  | 'wards'
  | 'referrals'
  | 'notes'
  | 'billing'
  | 'telemetry'
  | 'er'
  | 'pharmacy'
  | 'assets'
  | 'lab';

export interface LiveEvent {
  providerId: string;
  topics: LiveTopic[];
}

export interface SessionEnd {
  userId: string;
  reason: 'session_replaced' | 'frozen' | 'signed_out' | 'tokens_revoked';
}

/** A slice of bedside telemetry. Carries numbers and waveform only, never a name. */
export interface VitalsFrame {
  providerId: string;
  admissionId: string;
  at: number;
  hr?: number;
  spo2?: number;
  rr?: number;
  /** ECG samples since the last frame, and their sample rate. */
  ecg?: number[];
  fs?: number;
}

/**
 * In-process bus between whatever changed the data and the sockets watching
 * it. MongoDB change streams would need a replica set, which the local and
 * some hosted databases aren't, so writers announce their changes here.
 *
 * It reaches sockets on this instance only. The API runs as one Render
 * instance; running several would need a Redis bridge here.
 */
@Injectable()
export class LiveBus {
  private readonly emitter = new EventEmitter().setMaxListeners(0);
  private readonly socketCounts = new Map<string, number>();

  /** How many signed-in sockets a gateway holds, for the Admin Panel's system graph. */
  countSockets(gateway: string, n: number): void {
    this.socketCounts.set(gateway, n);
  }

  socketCount(gateway: string): number {
    return this.socketCounts.get(gateway) ?? 0;
  }

  /** Never throws: a dropped live update must not fail the write that caused it. */
  publish(
    providerId: { toString(): string } | null | undefined,
    ...topics: LiveTopic[]
  ): void {
    if (!providerId || !topics.length) return;
    try {
      this.emitter.emit('change', {
        providerId: providerId.toString(),
        topics,
      } satisfies LiveEvent);
    } catch {
      // A broken listener is the listener's problem.
    }
  }

  /** Closes this login's live connections straight away. */
  endSessions(userId: string, reason: SessionEnd['reason']): void {
    try {
      this.emitter.emit('session-end', { userId, reason } satisfies SessionEnd);
    } catch {
      // As above.
    }
  }

  frame(frame: VitalsFrame): void {
    try {
      this.emitter.emit('frame', frame);
    } catch {
      // As above.
    }
  }

  onFrame(listener: (f: VitalsFrame) => void): () => void {
    this.emitter.on('frame', listener);
    return () => this.emitter.off('frame', listener);
  }

  onChange(listener: (e: LiveEvent) => void): () => void {
    this.emitter.on('change', listener);
    return () => this.emitter.off('change', listener);
  }

  onSessionEnd(listener: (e: SessionEnd) => void): () => void {
    this.emitter.on('session-end', listener);
    return () => this.emitter.off('session-end', listener);
  }
}
