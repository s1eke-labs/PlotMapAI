// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  evaluateModuleHealth,
  findInvalidStableBarrelExports,
  isPassThroughModuleFile,
} from '../moduleHealth.mjs';

describe('moduleHealth', () => {
  const passThroughConfig = {
    enabled: true,
    files: ['src/domains/example/**/*.{ts,tsx}'],
    ignoreIndexFiles: true,
    exportLinePattern: "^export\\s+(type\\s+)?\\{[^}]+\\}\\s+from\\s+['\\\"][^'\\\"]+['\\\"];?$",
    exportStarLinePattern: "^export\\s+\\*\\s+from\\s+['\\\"][^'\\\"]+['\\\"];?$",
  };

  it('flags files that exceed the configured line budget', () => {
    const result = evaluateModuleHealth({
      'src/domains/example/oversized.ts': `${'line\n'.repeat(205)}`,
    }, {
      allowlist: [],
      maxFileLines: 200,
      passThrough: {
        ...passThroughConfig,
        enabled: false,
      },
      stableBarrels: [],
    });

    expect(result.oversizedFiles).toEqual([
      expect.objectContaining({
        filePath: 'src/domains/example/oversized.ts',
        lineCount: 206,
      }),
    ]);
  });

  it('respects allowlist exceptions when enforcing line budgets', () => {
    const result = evaluateModuleHealth({
      'src/domains/example/oversized.ts': `${'line\n'.repeat(205)}`,
    }, {
      allowlist: [
        {
          path: 'src/domains/example/oversized.ts',
          reason: 'Intentionally large for this test.',
        },
      ],
      maxFileLines: 200,
      passThrough: {
        ...passThroughConfig,
        enabled: false,
      },
      stableBarrels: [],
    });

    expect(result.oversizedFiles).toEqual([]);
  });

  it('detects pass-through re-export files and ignores index barrels', () => {
    expect(isPassThroughModuleFile(
      'src/domains/example/hooks/reexport.ts',
      'export { useThing } from \'./useThing\';\n',
      passThroughConfig,
    )).toBe(true);

    expect(isPassThroughModuleFile(
      'src/domains/example/index.ts',
      'export { useThing } from \'./useThing\';\n',
      passThroughConfig,
    )).toBe(false);
  });

  it('flags stable barrel exports outside the declared public surface', () => {
    expect(findInvalidStableBarrelExports(
      'src/domains/example/index.ts',
      [
        'export { stableThing } from \'./stableThing\';',
        'export { leakedThing } from \'./internalThing\';',
      ].join('\n'),
      [
        {
          allowedLines: [
            'export { stableThing } from \'./stableThing\';',
          ],
          message: 'example root barrel exporting non-stable symbols',
          path: 'src/domains/example/index.ts',
        },
      ],
    )).toEqual([
      {
        filePath: 'src/domains/example/index.ts',
        line: 'export { leakedThing } from \'./internalThing\';',
        message: 'example root barrel exporting non-stable symbols',
      },
    ]);
  });

  it('skips pass-through and stable barrel checks when a scope disables them', () => {
    const result = evaluateModuleHealth({
      'src/domains/example/reexport.ts': 'export { useThing } from \'./useThing\';\n',
      'src/domains/example/index.ts': 'export { leakedThing } from \'./internalThing\';\n',
    }, {
      allowlist: [],
      maxFileLines: 200,
      passThrough: {
        ...passThroughConfig,
        enabled: false,
      },
      stableBarrels: [],
    });

    expect(result.passThroughFiles).toEqual([]);
    expect(result.invalidStableBarrelExports).toEqual([]);
  });
});
