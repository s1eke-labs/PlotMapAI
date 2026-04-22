import { analysisService } from '@domains/analysis';
import { ensureDefaultPurificationRules, ensureDefaultTocRules } from '@domains/settings';
import { prepareDatabase } from '@infra/db';
import { clearAllReaderBootstrapSnapshots } from '@infra/storage/readerStateCache';

let initialized = false;
let initializationPromise: Promise<void> | null = null;

export async function initializeApplication(): Promise<void> {
  if (initialized) {
    return;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  clearAllReaderBootstrapSnapshots();

  initializationPromise = prepareDatabase()
    .then(() => Promise.all([
      ensureDefaultPurificationRules(),
      ensureDefaultTocRules(),
      analysisService.initialize(),
    ]))
    .then(() => {
      initialized = true;
    })
    .catch((error: unknown) => {
      initializationPromise = null;
      throw error;
    });

  return initializationPromise;
}
