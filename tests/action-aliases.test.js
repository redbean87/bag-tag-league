'use strict';

// Slice 2 of the data-driven league content: the pairs/provisioning web-app
// actions answer to a format-neutral name while the original doubles names
// stay wired as deprecated aliases. This drives doPost with both spellings and
// asserts the routed handler is the same one.

const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers/load-code');

function post(h, action, extra) {
  const body = Object.assign({ action }, extra || {});
  const out = h.fn('doPost')({ postData: { contents: JSON.stringify(body) } });
  return JSON.parse(out.getContent());
}

function actionPair(neutral, legacy) {
  return { neutral, legacy };
}

const PAIRS = [
  actionPair('getProvisioningState', 'getDoublesProvisioningState'),
  actionPair('previewUdiscImportPairs', 'previewUdiscImportDoubles'),
  actionPair('commitUdiscImportPairs', 'commitUdiscImportDoubles')
];

test('each format-neutral action routes to the same handler as its doubles alias', () => {
  for (const pair of PAIRS) {
    const neutral = loadCode();
    const legacy = loadCode();
    const payload = {
      league: neutral.bound.LEAGUE_ID_DOUBLES,
      league_date: '2026-10-05',
      rows: [{ name: 'Nobody', usernames: 'nobody' }]
    };

    const neutralResult = post(neutral, pair.neutral, payload);
    const legacyResult = post(legacy, pair.legacy, payload);

    // Do not compare timestamps; compare the routed behavior.
    assert.equal(neutralResult.status, legacyResult.status, pair.neutral);
    assert.equal(neutralResult.message, legacyResult.message, pair.neutral);
  }
});

test('provisionLeague and provisionDoubles provision the test spreadsheet identically', () => {
  const neutral = loadCode();
  const legacy = loadCode();

  const neutralResult = post(neutral, 'provisionLeague', {});
  const legacyResult = post(legacy, 'provisionDoubles', {});

  assert.equal(neutralResult.status, 'ok');
  assert.equal(legacyResult.status, 'ok');
  assert.equal(neutralResult.league.created, legacyResult.league.created);
  assert.equal(neutralResult.roster_seed.seeded, legacyResult.roster_seed.seeded);

  // Both must have created the canonical doubles tabs on their own spreadsheet.
  const neutralDoubles = neutral.makeSpreadsheet(neutral.bound.SPREADSHEET_ID_DOUBLES);
  const legacyDoubles = legacy.makeSpreadsheet(legacy.bound.SPREADSHEET_ID_DOUBLES);
  assert.deepEqual(
    neutralDoubles.getSheets().map((sheet) => sheet.getName()),
    legacyDoubles.getSheets().map((sheet) => sheet.getName())
  );
});
