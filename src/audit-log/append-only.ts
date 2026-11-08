import type { Schema } from 'mongoose';

const WRITE_QUERIES = [
  'updateOne',
  'updateMany',
  'replaceOne',
  'findOneAndUpdate',
  'findOneAndReplace',
  'findOneAndDelete',
  'deleteOne',
  'deleteMany',
] as const;

export const APPEND_ONLY_MESSAGE =
  'Audit records are permanent and can never be changed or deleted';

/**
 * Refuses any edit or delete through the application, for everyone, admins
 * included. The seals in audit-seal.service.ts catch anything done around it.
 */
export function makeAppendOnly(schema: Schema): void {
  const refuse = () => {
    throw new Error(APPEND_ONLY_MESSAGE);
  };
  for (const op of WRITE_QUERIES) {
    // updateOne and deleteOne are also document methods.
    schema.pre(op as 'updateOne', { document: true, query: true }, refuse);
  }
  schema.pre('save', function appendOnlySave() {
    if (!this.isNew) throw new Error(APPEND_ONLY_MESSAGE);
  });
}
