// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  loadArchitectureContract,
  loadTableOwnershipContract,
  validateArchitectureContract,
  validateTableOwnershipContract,
} from '../contracts.mjs';

describe('architecture contracts', () => {
  it('loads the repository architecture contract', () => {
    expect(loadArchitectureContract()).toMatchObject({
      layers: expect.arrayContaining([
        expect.objectContaining({ name: 'app', root: 'src/app' }),
        expect.objectContaining({ name: 'domains', root: 'src/domains' }),
      ]),
      moduleHealth: expect.objectContaining({
        scopes: expect.arrayContaining([
          expect.objectContaining({ name: 'book-import', maxLines: 240 }),
          expect.objectContaining({ name: 'app-debug', maxLines: 220 }),
        ]),
      }),
      readerArchitecture: expect.objectContaining({
        maxFileLines: 500,
        stableBarrels: expect.arrayContaining([
          expect.objectContaining({ path: 'src/domains/reader-layout-engine/index.ts' }),
          expect.objectContaining({ path: 'src/domains/reader-content/index.ts' }),
        ]),
      }),
      rules: expect.objectContaining({
        domainEntryConsumers: expect.objectContaining({
          restrictedSubpathPattern: '@domains/*/*',
        }),
      }),
    });
  });

  it('rejects missing required architecture fields', () => {
    const contract = structuredClone(loadArchitectureContract());
    delete contract.rules.domainEntryConsumers.message;

    expect(() => validateArchitectureContract(contract)).toThrow(
      'architecture contract.rules.domainEntryConsumers.message must be a non-empty string.',
    );
  });

  it('rejects unknown domain references in architecture rules', () => {
    const contract = structuredClone(loadArchitectureContract());
    contract.rules.specialInfraDbRestrictions[0].domain = 'missing-domain';

    expect(() => validateArchitectureContract(contract)).toThrow(
      'architecture contract.rules.specialInfraDbRestrictions[0].domain references an unknown domain: missing-domain',
    );
  });

  it('rejects duplicate layer definitions', () => {
    const contract = structuredClone(loadArchitectureContract());
    contract.layers.push(structuredClone(contract.layers[0]));

    expect(() => validateArchitectureContract(contract)).toThrow(
      'architecture contract.layers contains a duplicate layer name: app',
    );
  });

  it('rejects missing required reader architecture fields', () => {
    const contract = structuredClone(loadArchitectureContract());
    delete contract.readerArchitecture.passThrough.message;

    expect(() => validateArchitectureContract(contract)).toThrow(
      'architecture contract.readerArchitecture.passThrough.message must be a non-empty string.',
    );
  });

  it('rejects missing required module health scope fields', () => {
    const contract = structuredClone(loadArchitectureContract());
    delete contract.moduleHealth.scopes[0].maxLines;

    expect(() => validateArchitectureContract(contract)).toThrow(
      'architecture contract.moduleHealth.scopes[0].maxLines must be a positive integer.',
    );
  });

  it('rejects module health allowlist entries without reasons', () => {
    const contract = structuredClone(loadArchitectureContract());
    delete contract.moduleHealth.scopes[0].allowlist[0].reason;

    expect(() => validateArchitectureContract(contract)).toThrow(
      'architecture contract.moduleHealth.scopes[0].allowlist[0].reason must be a non-empty string.',
    );
  });

  it('rejects module health paths that do not exist', () => {
    const contract = structuredClone(loadArchitectureContract());
    contract.moduleHealth.scopes[0].allowlist[0].path = 'src/domains/book-import/missing.ts';

    expect(() => validateArchitectureContract(contract)).toThrow(
      'architecture contract.moduleHealth.scopes[0].allowlist[0].path references a missing path: src/domains/book-import/missing.ts',
    );
  });
});

describe('table ownership contracts', () => {
  it('loads the repository table ownership contract', () => {
    expect(loadTableOwnershipContract()).toMatchObject({
      tables: expect.arrayContaining([
        expect.objectContaining({ name: 'novels', ownerDomain: 'library' }),
        expect.objectContaining({ name: 'readerRenderCache', ownerDomain: 'reader-layout-engine' }),
      ]),
    });
  });

  it('rejects missing required ownership fields', () => {
    const contract = structuredClone(loadTableOwnershipContract());
    delete contract.tables[0].ownerDomain;

    expect(() => validateTableOwnershipContract(contract)).toThrow(
      'table ownership contract.tables[0].ownerDomain must be a non-empty string.',
    );
  });

  it('rejects unknown table references', () => {
    const contract = structuredClone(loadTableOwnershipContract());
    contract.tables[0].name = 'legacyStore';

    expect(() => validateTableOwnershipContract(contract)).toThrow(
      'table ownership contract.tables[0].name references an unknown table: legacyStore',
    );
  });

  it('rejects duplicate table definitions', () => {
    const contract = structuredClone(loadTableOwnershipContract());
    contract.tables.push(structuredClone(contract.tables[0]));

    expect(() => validateTableOwnershipContract(contract)).toThrow(
      'table ownership contract.tables contains a duplicate table name: novels',
    );
  });

  it('rejects application allowlists outside src/application', () => {
    const contract = structuredClone(loadTableOwnershipContract());
    contract.tables[0].allowedApplicationPaths = ['src/domains/library/novelRepository.ts'];

    expect(() => validateTableOwnershipContract(contract)).toThrow(
      'table ownership contract.tables[0].allowedApplicationPaths[0] must point into src/application: src/domains/library/novelRepository.ts',
    );
  });
});
