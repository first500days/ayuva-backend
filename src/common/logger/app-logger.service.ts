import { ConsoleLogger } from '@nestjs/common';
import { logTap, type LogLevel } from '../observability/log-tap';

/**
 * Structured (JSON line) logger so log output is directly machine-parseable
 * by the APM/observability pipeline (TRD §7 — structured logs correlated by
 * request ID, feeding Admin Analytics + AI Monitoring). Every line is also
 * tapped (redacted) for the Admin Panel's live "Investigate" stream.
 */
export class AppLogger extends ConsoleLogger {
  constructor() {
    super({ json: true, timestamp: true });
  }

  override log(message: unknown, ...rest: unknown[]): void {
    super.log(message, ...rest);
    this.tap('log', message, rest);
  }

  override warn(message: unknown, ...rest: unknown[]): void {
    super.warn(message, ...rest);
    this.tap('warn', message, rest);
  }

  override error(message: unknown, ...rest: unknown[]): void {
    super.error(message, ...rest);
    this.tap('error', message, rest);
  }

  override debug(message: unknown, ...rest: unknown[]): void {
    super.debug(message, ...rest);
    this.tap('debug', message, rest);
  }

  override verbose(message: unknown, ...rest: unknown[]): void {
    super.verbose(message, ...rest);
    this.tap('verbose', message, rest);
  }

  override fatal(message: unknown, ...rest: unknown[]): void {
    super.fatal(message, ...rest);
    this.tap('fatal', message, rest);
  }

  private tap(level: LogLevel, message: unknown, rest: unknown[]): void {
    // Nest passes the context last (after an optional stack for errors).
    const last = rest[rest.length - 1];
    const context = typeof last === 'string' ? last : this.context;
    try {
      logTap.push(level, message, context);
    } catch {
      // Never let the tap break logging.
    }
  }
}
