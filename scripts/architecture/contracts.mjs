import { readFileSync } from 'fs';
import { resolve } from 'path';

import { createRepositoryFacts, REPOSITORY_ROOT } from './repositoryFacts.mjs';

const ARCHITECTURE_CONTRACT_PATH = 'scripts/architecture/contracts/architecture.json';
const TABLE_OWNERSHIP_CONTRACT_PATH = 'scripts/architecture/contracts/table-ownership.json';

function fail(message) {
  throw new Error(message);
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(`${label} must be a non-empty string.`);
  }
}

function assertStringArray(value, label, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.trim().length === 0)) {
    fail(`${label} must be an array of non-empty strings.`);
  }
  if (!allowEmpty && value.length === 0) {
    fail(`${label} must not be empty.`);
  }
}

function readContractJson(rootDirectory, relativePath) {
  const absolutePath = resolve(rootDirectory, relativePath);
  try {
    return JSON.parse(readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    fail(`Failed to load ${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function getGlobBasePath(pattern) {
  const wildcardIndex = pattern.search(/[*?[{]/u);
  if (wildcardIndex === -1) {
    return pattern;
  }

  const lastSlashIndex = pattern.lastIndexOf('/', wildcardIndex);
  if (lastSlashIndex === -1) {
    return '';
  }

  return pattern.slice(0, lastSlashIndex).replace(/\/+$/u, '');
}

function assertExistingPath(pattern, label, facts) {
  const basePath = getGlobBasePath(pattern);
  if (basePath.length === 0 || !facts.pathExists(basePath)) {
    fail(`${label} references a missing path: ${pattern}`);
  }
}

function assertRestrictedImportEntries(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    fail(`${label} must be a non-empty array.`);
  }

  value.forEach((entry, index) => {
    assertObject(entry, `${label}[${index}]`);
    assertStringArray(entry.group, `${label}[${index}].group`);
    assertNonEmptyString(entry.message, `${label}[${index}].message`);
  });
}

export function validateArchitectureContract(contract, facts = createRepositoryFacts()) {
  assertObject(contract, 'architecture contract');
  if (!Array.isArray(contract.layers) || contract.layers.length === 0) {
    fail('architecture contract.layers must be a non-empty array.');
  }
  assertObject(contract.rules, 'architecture contract.rules');

  const layerNames = new Set();
  const layerRoots = new Set();
  contract.layers.forEach((layer, index) => {
    assertObject(layer, `architecture contract.layers[${index}]`);
    assertNonEmptyString(layer.name, `architecture contract.layers[${index}].name`);
    assertNonEmptyString(layer.root, `architecture contract.layers[${index}].root`);
    assertStringArray(layer.canDependOn, `architecture contract.layers[${index}].canDependOn`, { allowEmpty: true });

    if (layerNames.has(layer.name)) {
      fail(`architecture contract.layers contains a duplicate layer name: ${layer.name}`);
    }
    if (layerRoots.has(layer.root)) {
      fail(`architecture contract.layers contains a duplicate layer root: ${layer.root}`);
    }

    layerNames.add(layer.name);
    layerRoots.add(layer.root);
    assertExistingPath(layer.root, `architecture contract.layers[${index}].root`, facts);
  });

  contract.layers.forEach((layer, index) => {
    layer.canDependOn.forEach((dependency) => {
      if (!layerNames.has(dependency)) {
        fail(`architecture contract.layers[${index}].canDependOn references an unknown layer: ${dependency}`);
      }
    });
  });

  const { domainEntryConsumers, readerFamily, specialInfraDbRestrictions } = contract.rules;
  assertObject(domainEntryConsumers, 'architecture contract.rules.domainEntryConsumers');
  assertStringArray(
    domainEntryConsumers.files,
    'architecture contract.rules.domainEntryConsumers.files',
  );
  domainEntryConsumers.files.forEach((pattern, index) => {
    assertExistingPath(
      pattern,
      `architecture contract.rules.domainEntryConsumers.files[${index}]`,
      facts,
    );
  });
  assertNonEmptyString(
    domainEntryConsumers.restrictedSubpathPattern,
    'architecture contract.rules.domainEntryConsumers.restrictedSubpathPattern',
  );
  assertNonEmptyString(
    domainEntryConsumers.message,
    'architecture contract.rules.domainEntryConsumers.message',
  );

  if (!Array.isArray(specialInfraDbRestrictions) || specialInfraDbRestrictions.length === 0) {
    fail('architecture contract.rules.specialInfraDbRestrictions must be a non-empty array.');
  }
  specialInfraDbRestrictions.forEach((restriction, index) => {
    assertObject(restriction, `architecture contract.rules.specialInfraDbRestrictions[${index}]`);
    assertNonEmptyString(
      restriction.domain,
      `architecture contract.rules.specialInfraDbRestrictions[${index}].domain`,
    );
    if (!facts.domainNames.includes(restriction.domain)) {
      fail(
        `architecture contract.rules.specialInfraDbRestrictions[${index}].domain references an unknown domain: ${restriction.domain}`,
      );
    }
    assertStringArray(
      restriction.files,
      `architecture contract.rules.specialInfraDbRestrictions[${index}].files`,
    );
    restriction.files.forEach((pattern, fileIndex) => {
      assertExistingPath(
        pattern,
        `architecture contract.rules.specialInfraDbRestrictions[${index}].files[${fileIndex}]`,
        facts,
      );
    });
    assertStringArray(
      restriction.ignores,
      `architecture contract.rules.specialInfraDbRestrictions[${index}].ignores`,
      { allowEmpty: true },
    );
    restriction.ignores.forEach((pattern, ignoreIndex) => {
      assertExistingPath(
        pattern,
        `architecture contract.rules.specialInfraDbRestrictions[${index}].ignores[${ignoreIndex}]`,
        facts,
      );
    });
    assertStringArray(
      restriction.restrictedImports,
      `architecture contract.rules.specialInfraDbRestrictions[${index}].restrictedImports`,
    );
    assertNonEmptyString(
      restriction.message,
      `architecture contract.rules.specialInfraDbRestrictions[${index}].message`,
    );
  });

  assertObject(readerFamily, 'architecture contract.rules.readerFamily');
  assertStringArray(readerFamily.files, 'architecture contract.rules.readerFamily.files');
  readerFamily.files.forEach((pattern, index) => {
    assertExistingPath(
      pattern,
      `architecture contract.rules.readerFamily.files[${index}]`,
      facts,
    );
  });
  assertRestrictedImportEntries(
    readerFamily.restrictedImports,
    'architecture contract.rules.readerFamily.restrictedImports',
  );

  return contract;
}

export function validateTableOwnershipContract(contract, facts = createRepositoryFacts()) {
  assertObject(contract, 'table ownership contract');
  assertStringArray(contract.rules, 'table ownership contract.rules');
  assertStringArray(contract.dataModelNotes, 'table ownership contract.dataModelNotes');

  if (!Array.isArray(contract.crossDomainExits)) {
    fail('table ownership contract.crossDomainExits must be an array.');
  }
  contract.crossDomainExits.forEach((entry, index) => {
    assertObject(entry, `table ownership contract.crossDomainExits[${index}]`);
    assertNonEmptyString(entry.label, `table ownership contract.crossDomainExits[${index}].label`);
    assertNonEmptyString(entry.api, `table ownership contract.crossDomainExits[${index}].api`);
  });

  if (!Array.isArray(contract.tables) || contract.tables.length === 0) {
    fail('table ownership contract.tables must be a non-empty array.');
  }

  const tableNames = new Set();
  contract.tables.forEach((table, index) => {
    assertObject(table, `table ownership contract.tables[${index}]`);
    assertNonEmptyString(table.name, `table ownership contract.tables[${index}].name`);
    if (tableNames.has(table.name)) {
      fail(`table ownership contract.tables contains a duplicate table name: ${table.name}`);
    }
    if (!facts.knownTables.includes(table.name)) {
      fail(`table ownership contract.tables[${index}].name references an unknown table: ${table.name}`);
    }
    tableNames.add(table.name);

    assertNonEmptyString(
      table.ownerDomain,
      `table ownership contract.tables[${index}].ownerDomain`,
    );
    if (!facts.domainNames.includes(table.ownerDomain)) {
      fail(
        `table ownership contract.tables[${index}].ownerDomain references an unknown domain: ${table.ownerDomain}`,
      );
    }

    assertNonEmptyString(
      table.allowedDirectAccessSummary,
      `table ownership contract.tables[${index}].allowedDirectAccessSummary`,
    );
    assertStringArray(
      table.allowedDirectAccessPaths,
      `table ownership contract.tables[${index}].allowedDirectAccessPaths`,
    );
    table.allowedDirectAccessPaths.forEach((pattern, pathIndex) => {
      assertExistingPath(
        pattern,
        `table ownership contract.tables[${index}].allowedDirectAccessPaths[${pathIndex}]`,
        facts,
      );
      if (pattern.startsWith('src/application/')) {
        fail(
          `table ownership contract.tables[${index}].allowedDirectAccessPaths[${pathIndex}] must not point into src/application: ${pattern}`,
        );
      }
    });

    assertStringArray(
      table.allowedApplicationPaths,
      `table ownership contract.tables[${index}].allowedApplicationPaths`,
      { allowEmpty: true },
    );
    table.allowedApplicationPaths.forEach((pattern, pathIndex) => {
      assertExistingPath(
        pattern,
        `table ownership contract.tables[${index}].allowedApplicationPaths[${pathIndex}]`,
        facts,
      );
      if (!pattern.startsWith('src/application/')) {
        fail(
          `table ownership contract.tables[${index}].allowedApplicationPaths[${pathIndex}] must point into src/application: ${pattern}`,
        );
      }
    });

    assertStringArray(table.publicApi, `table ownership contract.tables[${index}].publicApi`);
  });

  return contract;
}

export function loadArchitectureContract(rootDirectory = REPOSITORY_ROOT) {
  const facts = createRepositoryFacts(rootDirectory);
  const contract = readContractJson(rootDirectory, ARCHITECTURE_CONTRACT_PATH);
  return validateArchitectureContract(contract, facts);
}

export function loadTableOwnershipContract(rootDirectory = REPOSITORY_ROOT) {
  const facts = createRepositoryFacts(rootDirectory);
  const contract = readContractJson(rootDirectory, TABLE_OWNERSHIP_CONTRACT_PATH);
  return validateTableOwnershipContract(contract, facts);
}

export {
  ARCHITECTURE_CONTRACT_PATH,
  TABLE_OWNERSHIP_CONTRACT_PATH,
};
