'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

const { MAP_PATH, buildMap } = require('../scripts/gen-code-map.js');

// The navigation map is only useful while it matches the file it indexes, so
// regeneration is enforced in CI rather than left to agent memory.
test('scripts/CODE_MAP.md is in sync with scripts/Code.gs', () => {
  const committed = fs.readFileSync(MAP_PATH, 'utf8');
  assert.strictEqual(
    committed,
    buildMap(),
    'scripts/CODE_MAP.md is stale - regenerate it with: node scripts/gen-code-map.js'
  );
});
