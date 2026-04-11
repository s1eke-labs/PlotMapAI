import type { ReaderPersistenceRuntimeValue } from '@shared/contracts/reader';

import { flushPersistence } from './readerSessionStore';

export async function flushReaderStateWithCapture(
  persistence: Pick<ReaderPersistenceRuntimeValue, 'runBeforeFlush'>,
): Promise<void> {
  persistence.runBeforeFlush();
  await flushPersistence();
}
