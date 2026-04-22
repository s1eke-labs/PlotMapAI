import type { Transaction } from 'dexie';

import { db } from '@infra/db';

export async function deleteLegacyReadingProgress(
  novelId: number,
  transaction?: Transaction,
): Promise<void> {
  const readingProgressTable = transaction
    ? transaction.table('readingProgress')
    : db.readingProgress;

  await readingProgressTable.where('novelId').equals(novelId).delete();
}

