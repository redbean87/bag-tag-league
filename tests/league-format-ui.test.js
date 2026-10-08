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
    assert.ok(
      league.scoring === LeagueFormat.SCORING.TAGS || league.scoring === LeagueFormat.SCORING.POINTS,
      'each league needs a tags or points scoring method'
    );
    assert.equal(typeof league.spreadsheetId, 'string');
    assert.ok(league.spreadsheetId.length > 0, 'each league needs a spreadsheet');
  }

  const formats = leagues.map((league) => league.format);
  assert.ok(formats.includes(LeagueFormat.FORMATS.SINGLES), 'expected a singles league');
  assert.ok(formats.includes(LeagueFormat.FORMATS.DOUBLES), 'expected a doubles league');

  const scorings = leagues.map((league) => league.scoring);
  assert.ok(scorings.includes(LeagueFormat.SCORING.TAGS), 'expected a tags league');
  assert.ok(scorings.includes(LeagueFormat.SCORING.POINTS), 'expected a points league');
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

test('gating reads the selected league capability rules from its league record', () => {
  const html = fs.readFileSync(path.join(REPO_ROOT, 'src', 'admin', 'index.html'), 'utf8');

  assert.match(html, /function applyLeague\(leagueId\)/);
  assert.match(html, /window\.LeagueFormat\.leagueById\(leagueId\)/);
  assert.match(html, /window\.LeagueFormat\.rulesForLeague\(leagueId\)/);
  assert.match(html, /rules\.usesTags/);
  assert.match(html, /rules\.usesPoints/);
  assert.match(html, /rules\.hasPairs/);
  assert.doesNotMatch(html, /var isDoubles = format === 'doubles'/);
  assert.doesNotMatch(html, /document\.getElementById\('leagueFormat'\)/);
  assert.doesNotMatch(html, /persistFormat\(window\.localStorage/);
});

test('rulesForLeague derives capabilities from the two enums, not the league id', () => {
  const singles = LeagueFormat.leagues().find((l) => l.format === LeagueFormat.FORMATS.SINGLES);
  const doubles = LeagueFormat.leagues().find((l) => l.format === LeagueFormat.FORMATS.DOUBLES);

  assert.deepEqual(LeagueFormat.rulesForLeague(singles.id), {
    format: LeagueFormat.FORMATS.SINGLES,
    scoring: LeagueFormat.SCORING.TAGS,
    usesTags: true,
    usesPoints: false,
    hasPairs: false
  });
  assert.deepEqual(LeagueFormat.rulesForLeague(doubles.id), {
    format: LeagueFormat.FORMATS.DOUBLES,
    scoring: LeagueFormat.SCORING.POINTS,
    usesTags: false,
    usesPoints: true,
    hasPairs: true
  });
});

test('scoringForLeague reads the league record, matching the registry', () => {
  for (const league of LeagueFormat.leagues()) {
    assert.equal(LeagueFormat.scoringForLeague(league.id), league.scoring);
  }
});

test('an unknown league or value normalizes to the registry defaults', () => {
  const fallback = LeagueFormat.rulesForLeague('not-a-league');
  assert.equal(fallback.format, LeagueFormat.FORMATS.SINGLES);
  assert.equal(fallback.scoring, LeagueFormat.SCORING.TAGS);
  assert.equal(fallback.usesTags, true);
  assert.equal(fallback.usesPoints, false);
  assert.equal(fallback.hasPairs, false);

  // A typo degrades to the default instead of coercing into the other value.
  assert.equal(LeagueFormat.normalizeFormat('triples'), LeagueFormat.FORMATS.SINGLES);
  assert.equal(LeagueFormat.normalizeScoring('handicap'), LeagueFormat.SCORING.TAGS);
  assert.equal(LeagueFormat.normalizeFormat(LeagueFormat.FORMATS.DOUBLES), LeagueFormat.FORMATS.DOUBLES);
  assert.equal(LeagueFormat.normalizeScoring(LeagueFormat.SCORING.POINTS), LeagueFormat.SCORING.POINTS);
});

// ─── Slice 7: picker badges, read-only settings, mismatch banner ─────────────

function functionBody(html, name) {
  const start = html.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'expected function ' + name);
  const next = html.indexOf('\n    function ', start + 1);
  return html.slice(start, next === -1 ? undefined : next);
}

test('the admin picker renders format and scoring badges from the registry record', () => {
  const html = fs.readFileSync(path.join(REPO_ROOT, 'src', 'admin', 'index.html'), 'utf8');

  assert.match(html, /id="leagueBadges"/);
  assert.match(html, /function renderLeagueBadges\(league, rules\)/);
  assert.match(html, /badgeElement\(league\.format\)/);
  assert.match(html, /badgeElement\(league\.scoring, 'scoring'\)/);

  const apply = functionBody(html, 'applyLeague');
  assert.match(apply, /renderLeagueBadges\(league, rules\)/);
});

test('the settings form shows format and scoring read-only', () => {
  const html = fs.readFileSync(path.join(REPO_ROOT, 'src', 'admin', 'index.html'), 'utf8');

  assert.match(html, /id="settingsFormat"/);
  assert.match(html, /id="settingsScoring"/);
  assert.match(html, /function renderReadonlySettings\(rules\)/);
  assert.match(html, /Format and scoring are set when a league is provisioned/);

  // The settings payload never carries the metadata enums for writing.
  const save = functionBody(html, 'saveLeagueSettings');
  assert.doesNotMatch(save, /league_format:\s*document\.getElementById/);
  assert.doesNotMatch(save, /scoring:\s*document\.getElementById/);
});

test('the admin banners a stored format/scoring that disagrees with the registry', () => {
  const html = fs.readFileSync(path.join(REPO_ROOT, 'src', 'admin', 'index.html'), 'utf8');

  assert.match(html, /id="leagueMismatch"/);
  assert.match(html, /function applyLeagueSettingsMismatch\(settings\)/);
  const mismatch = functionBody(html, 'applyLeagueSettingsMismatch');
  assert.match(mismatch, /settings\.league_format !== rules\.format/);
  assert.match(mismatch, /settings\.scoring !== rules\.scoring/);

  const load = functionBody(html, 'loadLeagueSettings');
  assert.match(load, /applyLeagueSettingsMismatch\(s\)/);
});
