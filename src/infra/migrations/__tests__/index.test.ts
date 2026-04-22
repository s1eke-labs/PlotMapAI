import { describe, expect, it } from 'vitest';

import { CURRENT_DB_SCHEMA_VERSION, DB_SCHEMA_MIGRATIONS } from '../dbSchema';

describe('db schema registry', () => {
  it('registers a migration lineage whose latest entry is the current schema baseline', () => {
    expect(DB_SCHEMA_MIGRATIONS.length).toBeGreaterThanOrEqual(1);
    expect(DB_SCHEMA_MIGRATIONS.at(-1)).toMatchObject({
      description: expect.any(String),
      scope: 'db-schema',
      version: CURRENT_DB_SCHEMA_VERSION,
    });
  });

  it('requires retire metadata for the remaining schema baseline', () => {
    for (const migration of DB_SCHEMA_MIGRATIONS) {
      expect(migration.retireWhen.condition).toBeTruthy();
    }
  });
});
