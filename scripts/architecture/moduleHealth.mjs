import { readdirSync, readFileSync, statSync } from 'fs';
import { extname, isAbsolute, relative, resolve } from 'path';

import { normalizePath } from './repositoryFacts.mjs';

export function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

export function countFileLines(source) {
  if (source.length === 0) {
    return 0;
  }

  return source.split(/\r?\n/).length;
}

function escapeRegexCharacter(character) {
  return character.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

export function globToRegExp(pattern) {
  let result = '^';

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    const nextCharacter = pattern[index + 1];
    const thirdCharacter = pattern[index + 2];

    if (character === '*' && nextCharacter === '*') {
      if (thirdCharacter === '/') {
        result += '(?:.*/)?';
        index += 2;
      } else {
        result += '.*';
        index += 1;
      }
      continue;
    }

    if (character === '*') {
      result += '[^/]*';
      continue;
    }

    if (character === '?') {
      result += '[^/]';
      continue;
    }

    if (character === '{') {
      const closingBraceIndex = pattern.indexOf('}', index);
      if (closingBraceIndex !== -1) {
        const alternatives = pattern
          .slice(index + 1, closingBraceIndex)
          .split(',')
          .map((entry) => escapeRegexCharacter(entry));
        result += `(?:${alternatives.join('|')})`;
        index = closingBraceIndex;
        continue;
      }
    }

    result += escapeRegexCharacter(character);
  }

  result += '$';
  return new RegExp(result);
}

export function matchesAnyPattern(filePath, patterns) {
  return patterns.some((pattern) => globToRegExp(pattern).test(filePath));
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

function walkDirectory(rootDirectory, currentDirectory = rootDirectory) {
  const entries = readdirSync(currentDirectory).sort();
  const results = [];

  for (const entry of entries) {
    const absolutePath = resolve(currentDirectory, entry);
    const entryStats = statSync(absolutePath);
    if (entryStats.isDirectory()) {
      results.push(...walkDirectory(rootDirectory, absolutePath));
      continue;
    }

    results.push(normalizePath(relative(rootDirectory, absolutePath)));
  }

  return results;
}

function normalizeRequestedPath(rootDirectory, inputPath) {
  if (isAbsolute(inputPath)) {
    return normalizePath(relative(rootDirectory, inputPath));
  }

  return normalizePath(inputPath);
}

function shouldIncludeConfiguredFile(filePath, config) {
  return (
    config.fileExtensions.includes(extname(filePath))
    && matchesAnyPattern(filePath, config.includePatterns)
    && !matchesAnyPattern(filePath, config.ignorePatterns)
  );
}

function listSearchRoots(includePatterns, searchRoots) {
  if (searchRoots.length > 0) {
    return searchRoots;
  }

  return [...new Set(includePatterns
    .map((pattern) => getGlobBasePath(pattern))
    .filter((basePath) => basePath.length > 0))];
}

export function collectConfiguredFiles(
  rootDirectory,
  {
    requestedPaths = [],
    searchRoots = [],
    includePatterns,
    ignorePatterns = [],
    fileExtensions,
  },
) {
  const discoveredPaths = requestedPaths.length > 0
    ? requestedPaths
      .map((filePath) => normalizeRequestedPath(rootDirectory, filePath))
      .filter((filePath) => shouldIncludeConfiguredFile(filePath, {
        fileExtensions,
        ignorePatterns,
        includePatterns,
      }))
    : listSearchRoots(includePatterns, searchRoots)
      .flatMap((directory) => walkDirectory(rootDirectory, resolve(rootDirectory, directory)))
      .filter((filePath) => shouldIncludeConfiguredFile(filePath, {
        fileExtensions,
        ignorePatterns,
        includePatterns,
      }));

  return Object.fromEntries([...new Set(discoveredPaths)].sort().map((filePath) => [
    filePath,
    readFileSync(resolve(rootDirectory, filePath), 'utf8'),
  ]));
}

export function isPassThroughModuleFile(filePath, source, config) {
  if (!config.enabled) {
    return false;
  }
  if (!matchesAnyPattern(filePath, config.files)) {
    return false;
  }
  if (config.ignoreIndexFiles && (filePath.endsWith('/index.ts') || filePath.endsWith('/index.tsx'))) {
    return false;
  }

  const exportLinePattern = new RegExp(config.exportLinePattern);
  const exportStarLinePattern = new RegExp(config.exportStarLinePattern);
  const significantLines = stripComments(source)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (significantLines.length === 0) {
    return false;
  }

  return significantLines.every((line) => (
    exportLinePattern.test(line) || exportStarLinePattern.test(line)
  ));
}

export function findInvalidStableBarrelExports(filePath, source, stableBarrels) {
  const stableBarrel = stableBarrels.find((entry) => entry.path === filePath);
  if (!stableBarrel) {
    return [];
  }

  const allowedLines = new Set(stableBarrel.allowedLines);
  return stripComments(source)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !allowedLines.has(line))
    .map((line) => ({
      filePath,
      line,
      message: stableBarrel.message,
    }));
}

export function evaluateModuleHealth(files, config) {
  const allowlistedFiles = new Set((config.allowlist ?? []).map((entry) => entry.path));
  const oversizedFiles = [];
  const passThroughFiles = [];
  const invalidStableBarrelExports = [];

  Object.entries(files).forEach(([filePath, source]) => {
    if (!allowlistedFiles.has(filePath)) {
      const lineCount = countFileLines(source);
      if (lineCount > config.maxFileLines) {
        oversizedFiles.push({ filePath, lineCount });
      }

      if (
        config.passThrough?.enabled
        && isPassThroughModuleFile(filePath, source, config.passThrough)
      ) {
        passThroughFiles.push(filePath);
      }

      invalidStableBarrelExports.push(
        ...findInvalidStableBarrelExports(filePath, source, config.stableBarrels ?? []),
      );
    }
  });

  return {
    invalidStableBarrelExports: invalidStableBarrelExports.sort((left, right) => (
      left.filePath.localeCompare(right.filePath) || left.line.localeCompare(right.line)
    )),
    oversizedFiles: oversizedFiles.sort((left, right) => (
      right.lineCount - left.lineCount || left.filePath.localeCompare(right.filePath)
    )),
    passThroughFiles: passThroughFiles.sort(),
  };
}
