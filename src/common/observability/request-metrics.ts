import type { NextFunction, Request, Response } from 'express';

interface Sample {
  at: number;
  ms: number;
  status: number;
}

const WINDOW_MS = 60_000;
const MAX_SAMPLES = 20_000;

/** Rolling one-minute view of API traffic: volume, latency and server errors. */
class RequestMetrics {
  private samples: Sample[] = [];

  record(ms: number, status: number, at = Date.now()): void {
    this.samples.push({ at, ms, status });
    if (this.samples.length > MAX_SAMPLES) this.samples.splice(0, 1_000);
  }

  snapshot(now = Date.now()) {
    const cutoff = now - WINDOW_MS;
    let first = 0;
    while (first < this.samples.length && this.samples[first].at < cutoff)
      first++;
    if (first) this.samples = this.samples.slice(first);
    const n = this.samples.length;
    const sorted = this.samples.map((s) => s.ms).sort((a, b) => a - b);
    const errors = this.samples.filter((s) => s.status >= 500).length;
    return {
      perMinute: n,
      p95Ms: n ? Math.round(sorted[Math.min(n - 1, Math.floor(n * 0.95))]) : 0,
      errorRate: n ? errors / n : 0,
      errors,
    };
  }
}

export const requestMetrics = new RequestMetrics();

export function requestMetricsMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    requestMetrics.record(ms, res.statusCode);
  });
  next();
}
