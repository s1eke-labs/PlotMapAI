import type { Transaction } from 'dexie';

import { db } from '@infra/db';

import type {
  PersistedReaderProgressSnapshot,
  ReaderProgressSnapshot,
} from './contracts';
import {
  toPersistedReaderProgressSnapshot,
  toReaderProgressRecord,
} from './mapper';

export async function readReaderProgressSnapshot(
  novelId: number,
): Promise<PersistedReaderProgressSnapshot | null> {
  const record = await db.readerProgress.get(novelId);
  if (!record) {
    return null;
  }

  const persisted = toPersistedReaderProgressSnapshot(record);
  if (!persisted) {
    await db.readerProgress.delete(novelId);
    return null;
  }

  return persisted;
}

export async function replaceReaderProgressSnapshot(
  novelId: number,
  snapshot: ReaderProgressSnapshot,
): Promise<PersistedReaderProgressSnapshot> {
  const existing = await db.readerProgress.get(novelId);
  const nextRevision = (typeof existing?.revision === 'number' ? existing.revision : 0) + 1;
  const record = toReaderProgressRecord({
    novelId,
    revision: nextRevision,
    snapshot,
    updatedAt: new Date().toISOString(),
  });

  await db.readerProgress.put(record);
  const persisted = toPersistedReaderProgressSnapshot(record);
  if (!persisted) {
    throw new Error('Failed to serialize persisted reader progress snapshot.');
  }

  return persisted;
}

export async function deleteReaderProgressSnapshot(
  novelId: number,
  transaction?: Transaction,
): Promise<void> {
  const readerProgressTable = transaction
    ? transaction.table('readerProgress')
    : db.readerProgress;

  await readerProgressTable.delete(novelId);
}
