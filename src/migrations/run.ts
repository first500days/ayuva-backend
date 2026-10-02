import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import configuration from '../config/configuration';
import type { Migration } from './migration.types';
import { recordFoldersMigration } from './001-record-folders';

// Applied in this order; append new migrations to the end.
const MIGRATIONS: Migration[] = [recordFoldersMigration];

// Config + Mongo only — no Redis/BullMQ/FCM, unlike booting AppModule (seed.ts).
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('mongodb.uri'),
      }),
    }),
  ],
})
class MigrationModule {}

/**
 * Usage:
 *   npm run migrate                 apply every pending migration
 *   npm run migrate -- --dry-run    report what would change, write nothing
 *   npm run migrate -- --only 001-record-folders
 */
async function run() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const onlyIdx = args.indexOf('--only');
  const only = onlyIdx >= 0 ? args[onlyIdx + 1] : undefined;

  const app = await NestFactory.createApplicationContext(MigrationModule, {
    logger: ['error', 'warn'],
  });
  const connection = app.get<Connection>(getConnectionToken());
  const applied = connection.collection('migrations');

  try {
    for (const migration of MIGRATIONS) {
      if (only && migration.id !== only) continue;
      if (await applied.findOne({ _id: migration.id as never })) {
        console.log(`= ${migration.id} already applied`);
        continue;
      }

      console.log(
        `${dryRun ? '? (dry run)' : '>'} ${migration.id}: ${migration.description}`,
      );
      const { summary } = await migration.up(connection, { dryRun });
      for (const [label, count] of Object.entries(summary)) {
        console.log(`    ${label}: ${count}`);
      }
      if (!dryRun) {
        await applied.insertOne({
          _id: migration.id as never,
          appliedAt: new Date(),
          summary,
        });
      }
    }
  } finally {
    await app.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
