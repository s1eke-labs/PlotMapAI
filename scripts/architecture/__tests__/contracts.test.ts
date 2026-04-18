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
