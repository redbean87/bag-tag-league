'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadCode, REPO_ROOT } = require('./helpers/load-code');

test('no or unknown selector resolves to the singles spreadsheet', () => {
  const h = loadCode();
  const resolve = h.fn('resolveSpreadsheetId');

  assert.equal(resolve(undefined), h.bound.SPREADSHEET_ID);
  assert.equal(resolve(null), h.bound.SPREADSHEET_ID);
  assert.equal(resolve(''), h.bound.SPREADSHEET_ID);
  assert.equal(resolve(h.bound.SPREADSHEET_ID), h.bound.SPREADSHEET_ID);
  assert.equal(resolve('some-other-spreadsheet-id'), h.bound.SPREADSHEET_ID);
});

test('doubles selector resolves to the configured doubles spreadsheet', () => {
  const h = loadCode();

  assert.equal(
    h.bound.SPREADSHEET_ID_DOUBLES,
    '1c8QGftl2bKcLZeqwE2IyzAh5x4I22WRjSSgc7nGgeG8'
  );
  assert.equal(
    h.fn('resolveSpreadsheetId')(h.bound.SPREADSHEET_ID_DOUBLES),
    h.bound.SPREADSHEET_ID_DOUBLES
  );
});

test('resolveSpreadsheet opens exactly the selected spreadsheet', () => {
  const h = loadCode();

  h.fn('resolveSpreadsheet')(h.bound.SPREADSHEET_ID_DOUBLES);
  assert.deepEqual(h.openByIdCalls, [h.bound.SPREADSHEET_ID_DOUBLES]);
});

test('league format derives from the selected spreadsheet', () => {
  const h = loadCode();
  const resolve = h.fn('resolveLeagueFormat');

  assert.equal(resolve(undefined), h.bound.LEAGUE_FORMAT_SINGLES);
  assert.equal(resolve(h.bound.SPREADSHEET_ID), h.bound.LEAGUE_FORMAT_SINGLES);
  assert.equal(resolve(h.bound.SPREADSHEET_ID_DOUBLES), h.bound.LEAGUE_FORMAT_DOUBLES);
});

test('handlers route through the resolver instead of the singles ID', () => {
  const h = loadCode();

  h.fn('handleGetWeeklyTabs')({ spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES });
  assert.deepEqual(h.openByIdCalls, [h.bound.SPREADSHEET_ID_DOUBLES]);

  const defaulted = loadCode();
  defaulted.fn('handleGetWeeklyTabs')({});
  assert.deepEqual(defaulted.openByIdCalls, [defaulted.bound.SPREADSHEET_ID]);
});

test('Code.gs has a single openById call, inside resolveSpreadsheet', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'Code.gs'), 'utf8');

  const directSinglesOpens = source.match(/SpreadsheetApp\.openById\(SPREADSHEET_ID\)/g) || [];
  assert.equal(directSinglesOpens.length, 0, 'handlers must not hard-code the singles ID');

  const allOpens = source.match(/SpreadsheetApp\.openById\(/g) || [];
  assert.equal(allOpens.length, 1, 'expected exactly one openById (the resolver)');
  assert.match(source, /function resolveSpreadsheet\(spreadsheetId\)/);
});
