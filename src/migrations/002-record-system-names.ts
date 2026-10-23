import type { Migration } from './migration.types';
import { systemFileName } from '../common/utils/system-file-name.util';

/**
 * Gives records uploaded before system names existed their AYUVA-IMG-XXXX /
 * AYUVA-REC-XXXX name, so admin and partner screens (and admin search) use it.
 * The name is derived from the record id, exactly as the app derives it when
 * the field is missing. Stored object keys of old uploads are not renamed.
 */
export const recordSystemNamesMigration: Migration = {
  id: '002-record-system-names',
  description: 'Backfill MedicalRecord.systemFileName for records uploaded before sanitized names',

  async up(connection, { dryRun }) {
    const records = connection.collection('medicalrecords');
    const filter = { systemFileName: { $exists: false } };
    const summary: Record<string, number> = {};
    if (dryRun) {
      summary['records to name'] = await records.countDocuments(filter);
      return { summary };
    }

    let named = 0;
    const cursor = records.find(filter, {
      projection: { _id: 1, mimeType: 1, originalFileName: 1 },
    });
    for await (const record of cursor) {
      await records.updateOne(
        { _id: record._id },
        {
          $set: {
            systemFileName: systemFileName(
              record._id.toHexString(),
              record.mimeType as string | undefined,
              record.originalFileName as string | undefined,
            ),
          },
        },
      );
      named++;
    }
    summary['records named'] = named;
    return { summary };
  },
};
