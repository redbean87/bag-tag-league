'use strict';

// Combined admin boot read: getBootState returns the League settings row and
// the Week tab list from a single Apps Script execution, while the legacy
// getLeagueSettings / getWeeklyTabs actions keep their exact response
// contracts for callers that refresh only one of them.
//
// Runs in a Node VM with an in-memory Sheets fake. No Google credentials,
// network access, or live sheet reads/writes are involved.

const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers/load-code');

const WEEK_ONE = '2026-10-05';
const WEEK_TWO = '2026-10-12';

/**
 * Builds the doubles spreadsheet with a roster, two Week tabs, and (unless
 * `withLeague` is false) a League settings row.
 */
function buildDoubles(h, options) {
  options = options || {};
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);

  const club = doubles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS_DOUBLES);
  club.appendRow([1, 'Ann', 'ann', '', true, '', '', 0]);

  [WEEK_TWO, WEEK_ONE].forEach((date) => {
    const week = doubles.insertSheet('Week ' + date);
    week.appendRow(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES);
  });

  if (options.withLeague !== false) {
    const league = doubles.insertSheet('League');
    league.appendRow(h.bound.LEAGUE_SHEET_HEADERS_DOUBLES);
    const row = new Array(h.bound.LEAGUE_SHEET_HEADERS_DOUBLES.length).fill('');
    const settings = options.leagueSettings || {
      league_name: 'Nightfliers Random Dubs',
      entry_fee: '7',
      points_by_place: '1:2,2:1.5'
    };
    for (const key in settings) {
      const index = h.bound.LEAGUE_SHEET_HEADERS_DOUBLES.indexOf(key);
      if (index !== -1) row[index] = settings[key];
    }
    league.appendRow(row);
  }

  return doubles;
}

function call(h, action) {
  const out = h.fn('doPost')({
    postData: {
      contents: JSON.stringify({
        action: action,
        league: h.bound.LEAGUE_ID_DOUBLES
      })
    }
  });
  return JSON.parse(out.getContent());
}

function boot(h) {
  return call(h, 'getBootState');
}

// `respond()` stamps every GitHub-visible legacy response with a timestamp;
// the boot components mirror the response data, not that per-call stamp.
function withoutTimestamp(result) {
  const copy = Object.assign({}, result);
  delete copy.timestamp;
  return copy;
}

// ─── Response equivalence with the legacy actions ──────────────────────────

test('getBootState returns both legacy responses unchanged', () => {
  const h = loadCode();
  buildDoubles(h);

  const bootData = boot(h);
  const settings = call(h, 'getLeagueSettings');
  const tabs = call(h, 'getWeeklyTabs');

  assert.equal(bootData.status, 'ok');
  assert.equal(bootData.league, h.bound.LEAGUE_ID_DOUBLES);

  // Each component is the legacy action's response, so the existing settings
  // and tabs renderers keep working on the combined result.
  assert.deepEqual(bootData.settings, withoutTimestamp(settings));
  assert.deepEqual(bootData.weekly_tabs, withoutTimestamp(tabs));
  assert.equal(bootData.settings.status, 'ok');
  assert.equal(bootData.weekly_tabs.status, 'ok');
  assert.deepEqual(bootData.weekly_tabs.weeks.map((week) => week.date), [WEEK_TWO, WEEK_ONE]);
});

test('getBootState opens the league spreadsheet once instead of twice', () => {
  const combined = loadCode();
  buildDoubles(combined);
  boot(combined);
  assert.deepEqual(combined.openByIdCalls, [combined.bound.SPREADSHEET_ID_DOUBLES]);

  const separate = loadCode();
  buildDoubles(separate);
  call(separate, 'getLeagueSettings');
  call(separate, 'getWeeklyTabs');
  assert.equal(separate.openByIdCalls.length, 2);
});

test('getBootState reports a missing League sheet exactly as the legacy action does', () => {
  const h = loadCode();
  buildDoubles(h, { withLeague: false });

  const bootData = boot(h);
  const legacy = call(h, 'getLeagueSettings');

  assert.deepEqual(bootData.settings, withoutTimestamp(legacy));
  assert.equal(bootData.settings.state, 'missing');
  assert.equal(bootData.weekly_tabs.status, 'ok');
  assert.equal(bootData.weekly_tabs.weeks.length, 2);
});

test('the legacy actions stay registered and callable for single refreshes', () => {
  const h = loadCode();
  buildDoubles(h);

  for (const action of ['getLeagueSettings', 'getWeeklyTabs', 'getBootState']) {
    const result = call(h, action);
    assert.equal(result.status, 'ok', action);
    assert.equal(typeof result.message, 'string', action);
  }
});

// ─── Independent component failure ─────────────────────────────────────────

test('a weekly-tab failure keeps the settings result and its status', () => {
  const h = loadCode();
  const doubles = buildDoubles(h);
  doubles.getSheets = function() {
    throw new Error('tab listing failed');
  };

  const result = boot(h);
  assert.equal(result.status, 'ok');
  assert.equal(result.settings.status, 'ok');
  assert.equal(result.settings.state, 'ok');
  assert.equal(result.settings.settings.league_name, 'Nightfliers Random Dubs');
  assert.equal(result.weekly_tabs.status, 'error');
  assert.match(result.weekly_tabs.message, /tab listing failed/);
  assert.deepEqual(result.weekly_tabs.weeks, []);
});

test('a settings failure keeps the weekly-tab result', () => {
  const h = loadCode();
  const doubles = buildDoubles(h);
  const original = doubles.getSheetByName;
  doubles.getSheetByName = function(name) {
    if (name === 'League') throw new Error('settings read failed');
    return original.call(this, name);
  };

  const result = boot(h);
  assert.equal(result.status, 'ok');
  assert.equal(result.settings.status, 'error');
  assert.match(result.settings.message, /settings read failed/);
  assert.equal(result.weekly_tabs.status, 'ok');
  assert.equal(result.weekly_tabs.weeks.length, 2);
});

// ─── No writes ─────────────────────────────────────────────────────────────

test('getBootState writes nothing', () => {
  const h = loadCode();
  const doubles = buildDoubles(h);
  const before = JSON.stringify(doubles.getSheets().map((sheet) => sheet.rows));

  boot(h);

  const after = JSON.stringify(doubles.getSheets().map((sheet) => sheet.rows));
  assert.equal(after, before);
});
