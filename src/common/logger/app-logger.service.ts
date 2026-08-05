import { ConsoleLogger } from '@nestjs/common';

/**
 * Structured (JSON line) logger so log output is directly machine-parseable
 * by the APM/observability pipeline (TRD §7 — structured logs correlated by
 * request ID, feeding Admin Analytics + AI Monitoring).
 */
export class AppLogger extends ConsoleLogger {
  constructor() {
    super({ json: true, timestamp: true });
  }
}
