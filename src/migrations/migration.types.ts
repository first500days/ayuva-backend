import type { Connection } from 'mongoose';

export interface MigrationResult {
  // Human-readable counts, printed by the runner and stored with the run.
  summary: Record<string, number>;
}

/**
 * One-off data migration. Works on raw collections (connection.collection),
 * not mongoose models, so it keeps meaning the same thing after the schemas
 * move on. Must be idempotent: the runner skips applied ones, but a failed
 * run is retried from the start.
 */
export interface Migration {
  id: string;
  description: string;
  up(
    connection: Connection,
    options: { dryRun: boolean },
  ): Promise<MigrationResult>;
}
