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
  | 'lab'
  | 'shares';

export interface LiveEvent {
  providerId: string;
  topics: LiveTopic[];
}

export interface SessionEnd {
  userId: string;
  reason: 'session_replaced' | 'frozen' | 'signed_out' | 'tokens_revoked';
}

/** A patient's share with a partner ended: its open screens must stop showing that patient's shared data. */
export interface ShareEnded {
  providerId: string;
  patientId: string;
  grantId: string;
  reason: 'expired' | 'revoked';
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

  /** Announces an ended share to this instance's partner sockets (see ShareLiveService). */
  shareEnded(e: ShareEnded): void {
    try {
      this.emitter.emit('share-ended', e);
      this.publish(e.providerId, 'shares');
    } catch {
      // As above.
    }
  }

  /** A small status message for one patient's open app (see PatientLiveGateway). Ids and states only. */
  toPatient(
    userId: string,
    message: { t: string } & Record<string, unknown>,
  ): void {
    try {
      this.emitter.emit('patient', { userId, message });
    } catch {
      // As above.
    }
  }

  onPatient(
    listener: (e: {
      userId: string;
      message: { t: string } & Record<string, unknown>;
    }) => void,
  ): () => void {
    this.emitter.on('patient', listener);
    return () => this.emitter.off('patient', listener);
  }

  /** A booked slot was released by a cancellation; the waitlist offers it. */
  slotOpened(slotId: string): void {
    try {
      this.emitter.emit('slot-opened', slotId);
    } catch {
      // As above.
    }
  }

  onSlotOpened(listener: (slotId: string) => void): () => void {
    this.emitter.on('slot-opened', listener);
    return () => this.emitter.off('slot-opened', listener);
  }

  onShareEnded(listener: (e: ShareEnded) => void): () => void {
    this.emitter.on('share-ended', listener);
    return () => this.emitter.off('share-ended', listener);
  }

  onSessionEnd(listener: (e: SessionEnd) => void): () => void {
    this.emitter.on('session-end', listener);
    return () => this.emitter.off('session-end', listener);
  }
}
