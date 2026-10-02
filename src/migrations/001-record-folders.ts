import type { Migration } from './migration.types';
import { LEGACY_RECORD_TYPE_MAP } from '../core/records/schemas/medical-record.schema';

/**
 * MedicalRecord.type → the seven vault folders (PRODUCT_JOURNEY_PLAN §4).
 * The old value is kept in `legacyType` so the mapping can be audited or
 * reversed. Also backfills the new `kind` and `tags` fields.
 */
export const recordFoldersMigration: Migration = {
  id: '001-record-folders',
  description:
    'Map legacy record types (blood/imaging/ecg/consultation) to vault folders',

  async up(connection, { dryRun }) {
    const records = connection.collection('medicalrecords');
    const summary: Record<string, number> = {};

    for (const [legacy, folder] of Object.entries(LEGACY_RECORD_TYPE_MAP)) {
      const filter = { type: legacy };
      if (dryRun) {
        summary[`${legacy}->${folder}`] = await records.countDocuments(filter);
        continue;
      }
      const res = await records.updateMany(filter, [
        { $set: { legacyType: '$type', type: folder } },
      ]);
      summary[`${legacy}->${folder}`] = res.modifiedCount;
    }

    const kindFilter = { kind: { $exists: false } };
    const tagsFilter = { tags: { $exists: false } };
    if (dryRun) {
      summary['kind backfilled'] = await records.countDocuments(kindFilter);
      summary['tags backfilled'] = await records.countDocuments(tagsFilter);
    } else {
      summary['kind backfilled'] = (
        await records.updateMany(kindFilter, { $set: { kind: 'original' } })
      ).modifiedCount;
      summary['tags backfilled'] = (
        await records.updateMany(tagsFilter, { $set: { tags: [] } })
      ).modifiedCount;
    }

    return { summary };
  },
};
