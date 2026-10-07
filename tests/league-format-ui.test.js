'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const LeagueFormat = require('../src/shared/league-format');
const { REPO_ROOT } = require('./helpers/load-code');

function makeStorage(initial) {
  const store = Object.assign({}, initial);
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key, value) {
      store[key] = String(value);
    }
  };
}

test('the picker lists real leagues, each carrying its own format', () => {
  const leagues = LeagueFormat.leagues();
  assert.ok(leagues.length >= 2, 'expected the singles and doubles leagues');

  for (const league of leagues) {
    assert.equal(typeof league.id, 'string');
    assert.ok(league.id.length > 0, 'each league needs a stable id');
    assert.equal(typeof league.name, 'string');
    assert.ok(league.name.length > 0, 'each league needs a display name');
    assert.ok(
      league.format === LeagueFormat.FORMATS.SINGLES || league.format === LeagueFormat.FORMATS.DOUBLES,
      'each league needs a singles or doubles format'
    );
    assert.equal(typeof league.spreadsheetId, 'string');
    assert.ok(league.spreadsheetId.length > 0, 'each league needs a spreadsheet');
  }

  const formats = leagues.map((league) => league.format);
  assert.ok(formats.includes(LeagueFormat.FORMATS.SINGLES), 'expected a singles league');
  assert.ok(formats.includes(LeagueFormat.FORMATS.DOUBLES), 'expected a doubles league');
});

test('the first league is the default for an empty or missing storage', () => {
  assert.equal(LeagueFormat.readStoredLeagueId(null), LeagueFormat.DEFAULT_LEAGUE_ID);
  assert.equal(LeagueFormat.readStoredLeagueId(makeStorage({})), LeagueFormat.DEFAULT_LEAGUE_ID);
  assert.equal(
    LeagueFormat.readStoredFormat(makeStorage({})),
    LeagueFormat.leagueById(LeagueFormat.DEFAULT_LEAGUE_ID).format
  );
});

test('the selected league persists across reloads', () => {
  const doubles = LeagueFormat.leagues().find((l) => l.format === LeagueFormat.FORMATS.DOUBLES);
  const storage = makeStorage({});

  LeagueFormat.persistLeagueId(storage, doubles.id);
  assert.equal(LeagueFormat.readStoredLeagueId(storage), doubles.id);
  assert.equal(LeagueFormat.readStoredFormat(storage), LeagueFormat.FORMATS.DOUBLES);

  LeagueFormat.persistLeagueId(storage, LeagueFormat.DEFAULT_LEAGUE_ID);
  assert.equal(LeagueFormat.readStoredLeagueId(storage), LeagueFormat.DEFAULT_LEAGUE_ID);
});

test('an unknown stored league id falls back to the default', () => {
  const storage = makeStorage({ [LeagueFormat.STORAGE_KEY]: 'nonsense' });
  assert.equal(LeagueFormat.readStoredLeagueId(storage), LeagueFormat.DEFAULT_LEAGUE_ID);
  assert.equal(LeagueFormat.readStoredFormat(storage), LeagueFormat.FORMATS.SINGLES);
});

test('a legacy stored format migrates to its league', () => {
  const doubles = LeagueFormat.leagues().find((l) => l.format === LeagueFormat.FORMATS.DOUBLES);
  const storage = makeStorage({
    [LeagueFormat.LEGACY_STORAGE_KEY]: LeagueFormat.FORMATS.DOUBLES
  });

  assert.equal(LeagueFormat.readStoredLeagueId(storage), doubles.id);
  assert.equal(LeagueFormat.readStoredFormat(storage), LeagueFormat.FORMATS.DOUBLES);
});

test('storage failures fall back to the default instead of throwing', () => {
  const throwing = {
    getItem() {
      throw new Error('denied');
    },
    setItem() {
      throw new Error('denied');
    }
  };

  assert.equal(LeagueFormat.readStoredLeagueId(throwing), LeagueFormat.DEFAULT_LEAGUE_ID);
  assert.equal(
    LeagueFormat.persistLeagueId(throwing, LeagueFormat.DEFAULT_LEAGUE_ID),
    LeagueFormat.DEFAULT_LEAGUE_ID
  );
});

test('format and spreadsheet derive from the league record, not a parallel map', () => {
  for (const league of LeagueFormat.leagues()) {
    assert.equal(LeagueFormat.formatForLeague(league.id), league.format);
    assert.equal(LeagueFormat.spreadsheetIdForLeague(league.id), league.spreadsheetId);
  }
});

test('leagueIdForFormat resolves a format to the league that carries it', () => {
  const singles = LeagueFormat.leagues().find((l) => l.format === LeagueFormat.FORMATS.SINGLES);
  const doubles = LeagueFormat.leagues().find((l) => l.format === LeagueFormat.FORMATS.DOUBLES);

  assert.equal(LeagueFormat.leagueIdForFormat(LeagueFormat.FORMATS.SINGLES), singles.id);
  assert.equal(LeagueFormat.leagueIdForFormat(LeagueFormat.FORMATS.DOUBLES), doubles.id);
});

test('spreadsheetIdForFormat maps each format to its spreadsheet', () => {
  assert.equal(
    LeagueFormat.spreadsheetIdForFormat('singles'),
    '1kgTRXIiyyXAzWdLf0q_dY-1U3tpKvPVTwYDl8Ok7lik'
  );
  assert.equal(
    LeagueFormat.spreadsheetIdForFormat('doubles'),
    '1c8QGftl2bKcLZeqwE2IyzAh5x4I22WRjSSgc7nGgeG8'
  );
});

test('the admin UI populates the picker from the league registry', () => {
  const html = fs.readFileSync(path.join(REPO_ROOT, 'src', 'admin', 'index.html'), 'utf8');

  assert.match(html, /src="\.\.\/shared\/league-format\.js"/);
  assert.match(html, /id="leaguePicker"/);
  assert.match(html, /<select id="leaguePicker" onchange="onLeagueChange\(\)"><\/select>/);
  assert.match(html, /window\.LeagueFormat\.leagues\(\)/);
  assert.match(html, /function populateLeaguePicker\(\)/);
  assert.match(html, /function onLeagueChange\(\)/);
  assert.match(html, /function getSpreadsheetId\(\)/);
  assert.doesNotMatch(html, /<option value="singles">Singles<\/option>/);
  assert.doesNotMatch(html, /<option value="doubles">Doubles<\/option>/);

  const actionRegex = /action: '[A-Za-z]+'/g;
  let match;
  let actionCount = 0;
  while ((match = actionRegex.exec(html)) !== null) {
    actionCount++;
    const window = html.slice(match.index, match.index + 200);
    assert.match(
      window,
      /spreadsheetId: getSpreadsheetId\(\)/,
      match[0] + ' must include spreadsheetId'
    );
  }
  assert.ok(actionCount > 0, 'expected action requests in the admin page');
});

test('gating reads the selected league format from its league record', () => {
  const html = fs.readFileSync(path.join(REPO_ROOT, 'src', 'admin', 'index.html'), 'utf8');

  assert.match(html, /function applyLeague\(leagueId\)/);
  assert.match(html, /window\.LeagueFormat\.leagueById\(leagueId\)/);
  assert.match(html, /var isDoubles = format === 'doubles'/);
  assert.doesNotMatch(html, /document\.getElementById\('leagueFormat'\)/);
  assert.doesNotMatch(html, /persistFormat\(window\.localStorage/);
});
