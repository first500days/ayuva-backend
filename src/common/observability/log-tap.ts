import { EventEmitter } from 'node:events';

export type LogLevel = 'log' | 'warn' | 'error' | 'debug' | 'verbose' | 'fatal';

export interface TappedLine {
  at: string;
  level: LogLevel;
  context: string;
  message: string;
}

const KEEP = 500;
const MAX_CHARS = 600;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(?<!\d)(?:\+?\d[\d -]{8,}\d)(?!\d)/g;
const BEARER = /(bearer\s+)[\w.-]+/gi;

/** Masks contact details and tokens so a streamed line never carries them. */
export function redactLine(text: string): string {
  return text
    .replace(BEARER, '$1•••')
    .replace(EMAIL, '•••@•••')
    .replace(PHONE, '••••••');
}

function stringify(message: unknown): string {
  if (typeof message === 'string') return message;
  if (message instanceof Error) return message.stack ?? message.message;
  try {
    return JSON.stringify(message);
  } catch {
    return String(message);
  }
}

/**
 * The last few hundred application log lines, kept in memory so the Admin
 * Panel can tail them live while investigating a service. Lines are redacted
 * and truncated before they are kept.
 */
class LogTap {
  private readonly lines: TappedLine[] = [];
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  push(level: LogLevel, message: unknown, context?: string): void {
    const text = redactLine(stringify(message)).slice(0, MAX_CHARS);
    const line: TappedLine = {
      at: new Date().toISOString(),
      level,
      context: context ?? 'App',
      message: text,
    };
    this.lines.push(line);
    if (this.lines.length > KEEP) this.lines.shift();
    this.emitter.emit('line', line);
  }

  recent(match?: (l: TappedLine) => boolean, n = 100): TappedLine[] {
    const rows = match ? this.lines.filter(match) : this.lines;
    return rows.slice(-n);
  }

  onLine(listener: (l: TappedLine) => void): () => void {
    this.emitter.on('line', listener);
    return () => this.emitter.off('line', listener);
  }
}

export const logTap = new LogTap();
