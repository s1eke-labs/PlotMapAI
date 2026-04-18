import { fileURLToPath } from 'url';
import { resolve } from 'path';

import { loadArchitectureContract } from './architecture/contracts.mjs';
import { collectConfiguredFiles, evaluateModuleHealth } from './architecture/moduleHealth.mjs';

function printWarningSection(title, lines) {
  if (lines.length === 0) {
    return;
  }

  console.warn(`Module health warning: ${title}`);
  lines.forEach((line) => {
    console.warn(`- ${line}`);
  });
}

function buildScopeConfig(moduleHealth, scope) {
  return {
    allowlist: scope.allowlist,
    maxFileLines: scope.maxLines,
    passThrough: {
      ...moduleHealth.passThrough,
      enabled: scope.checkPassThroughReExports,
      files: scope.passThroughFiles,
      ignoreIndexFiles: true,
    },
    stableBarrels: scope.checkStableBarrels ? scope.stableBarrels : [],
  };
}

function evaluateModuleHealthScope(rootDirectory, moduleHealth, scope, requestedPaths) {
  const files = collectConfiguredFiles(rootDirectory, {
    requestedPaths,
    includePatterns: scope.files,
    ignorePatterns: scope.ignores,
    fileExtensions: moduleHealth.fileExtensions,
  });

  return evaluateModuleHealth(files, buildScopeConfig(moduleHealth, scope));
}

export function runModuleHealthCheck(argv = process.argv.slice(2)) {
  const rootDirectory = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const { moduleHealth } = loadArchitectureContract(rootDirectory);
  const requestedPaths = argv.filter((argument) => argument !== '--strict');
  const results = moduleHealth.scopes.map((scope) => ({
    result: evaluateModuleHealthScope(rootDirectory, moduleHealth, scope, requestedPaths),
    scope,
  }));

  let warningCount = 0;
  results.forEach(({ scope, result }) => {
    warningCount +=
      result.invalidStableBarrelExports.length
      + result.oversizedFiles.length
      + result.passThroughFiles.length;

    printWarningSection(
      `${scope.name} files over ${scope.maxLines} lines`,
      result.oversizedFiles.map(({ filePath, lineCount }) => `${filePath} (${lineCount} lines)`),
    );
    printWarningSection(
      `${scope.name} pass-through re-export files`,
      result.passThroughFiles,
    );

    const stableBarrelWarnings = new Map();
    result.invalidStableBarrelExports.forEach(({ filePath, line, message }) => {
      const entries = stableBarrelWarnings.get(message) ?? [];
      entries.push(`${filePath} -> ${line}`);
      stableBarrelWarnings.set(message, entries);
    });
    stableBarrelWarnings.forEach((lines, message) => {
      printWarningSection(message, lines);
    });
  });

  if (warningCount === 0) {
    console.log('Module health checks passed.');
    return results;
  }

  throw new Error(`Module health checks found ${warningCount} warning(s).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runModuleHealthCheck();
}
