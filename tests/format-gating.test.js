'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers/load-code');

const TAG_ACTIONS = ['handleCalculateTags', 'handleConfirmTags', 'handleFinalizeRound'];

test('tag lifecycle handlers refuse the doubles format before opening a sheet', () => {
  for (const action of TAG_ACTIONS) {
    const h = loadCode();
    const result = h.parse(h.fn(action)({
      league_date: '2026-10-05',
      spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES
    }));

    assert.equal(result.status, 'error', action + ' should refuse doubles');
    assert.match(result.message, /doubles/i, action + ' should name the doubles format');
    assert.deepEqual(
      h.openByIdCalls,
      [],
      action + ' must not open the doubles spreadsheet'
    );
  }
});

test('tag lifecycle handlers still run for singles (routing unchanged)', () => {
  const h = loadCode();
  const result = h.parse(h.fn('handleCalculateTags')({
    league_date: '2026-10-05',
    spreadsheetId: h.bound.SPREADSHEET_ID
  }));

  // No weekly tab exists in the fake, so this is the normal singles error.
  assert.equal(result.status, 'error');
  assert.doesNotMatch(result.message, /doubles/i);
  assert.deepEqual(h.openByIdCalls, [h.bound.SPREADSHEET_ID]);
});

test('doubles weekly tabs are isolated by format through the shared accessors', () => {
  const h = loadCode();

  assert.equal(
    h.fn('getWeeklyRecordHeaders')(h.fn('resolveLeagueFormat')(h.bound.SPREADSHEET_ID_DOUBLES)).length,
    54
  );
  assert.equal(
    h.fn('getWeeklyRecordHeaders')(h.fn('resolveLeagueFormat')(undefined)).length,
    48
  );
});
