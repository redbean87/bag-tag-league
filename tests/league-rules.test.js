'use strict';

// Server league registry and capability map — the deploy-time authority that
// turns the format and scoring enums into the usesTags/usesPoints/hasPairs
// flags handlers branch on. Runs in a Node VM with in-memory Sheets fakes.

const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers/load-code');

test('the server allow-list carries both enums and stays two-valued', () => {
  const h = loadCode();

  assert.deepEqual(h.bound.LEAGUE_FORMATS, [h.bound.LEAGUE_FORMAT_SINGLES, h.bound.LEAGUE_FORMAT_DOUBLES]);
  assert.deepEqual(h.bound.SCORING_METHODS, [h.bound.SCORING_TAGS, h.bound.SCORING_POINTS]);

  for (const record of h.bound.LEAGUE_SPREADSHEETS) {
    assert.ok(
      h.bound.LEAGUE_FORMATS.indexOf(record.format) !== -1,
      record.id + ' must carry an allow-listed format'
    );
    assert.ok(
      h.bound.SCORING_METHODS.indexOf(record.scoring) !== -1,
      record.id + ' must carry an allow-listed scoring method'
    );
    assert.equal(typeof record.spreadsheetId, 'string');
  }
});

test('getLeagueRules derives capabilities from enums, not the league id', () => {
  const h = loadCode();
  const rules = h.fn('getLeagueRules');

  assert.deepEqual(rules(h.bound.LEAGUE_ID_SINGLES), {
    format: h.bound.LEAGUE_FORMAT_SINGLES,
    scoring: h.bound.SCORING_TAGS,
    usesTags: true,
    usesPoints: false,
    hasPairs: false,
    points: { byPlace: { 1: 2, 2: 1.5, 3: 1 }, participation: 0.5 },
    payout: { configured: false, contribution: 0, secondAmount: 0, secondMinPlayers: 0 }
  });
  assert.deepEqual(rules(h.bound.LEAGUE_ID_DOUBLES), {
    format: h.bound.LEAGUE_FORMAT_DOUBLES,
    scoring: h.bound.SCORING_POINTS,
    usesTags: false,
    usesPoints: true,
    hasPairs: true,
    points: { byPlace: { 1: 2, 2: 1.5, 3: 1 }, participation: 0.5 },
    payout: { configured: false, contribution: 0, secondAmount: 0, secondMinPlayers: 0 }
  });
});

test('an unknown selector resolves to the singles/tags default rules', () => {
  const h = loadCode();
  const rules = h.fn('getLeagueRules');

  for (const selector of [undefined, null, '', 'not-a-league']) {
    const resolved = rules(selector);
    assert.equal(resolved.format, h.bound.LEAGUE_FORMAT_SINGLES);
    assert.equal(resolved.scoring, h.bound.SCORING_TAGS);
    assert.equal(resolved.usesTags, true);
    assert.equal(resolved.hasPairs, false);
  }
});

test('resolveLeagueFormat is re-pointed through the league table', () => {
  const h = loadCode();
  const resolve = h.fn('resolveLeagueFormat');

  assert.equal(resolve(h.bound.LEAGUE_ID_DOUBLES), h.bound.LEAGUE_FORMAT_DOUBLES);
  assert.equal(resolve(h.bound.SPREADSHEET_ID_DOUBLES), h.bound.LEAGUE_FORMAT_DOUBLES);
  assert.equal(resolve(h.bound.LEAGUE_ID_SINGLES), h.bound.LEAGUE_FORMAT_SINGLES);
  assert.equal(resolve(undefined), h.bound.LEAGUE_FORMAT_SINGLES);
});

test('normalization degrades unknown values to the default loudly, never crossing values', () => {
  const h = loadCode();

  assert.equal(h.fn('normalizeFormat')('triples'), h.bound.LEAGUE_FORMAT_SINGLES);
  assert.equal(h.fn('normalizeFormat')(h.bound.LEAGUE_FORMAT_DOUBLES), h.bound.LEAGUE_FORMAT_DOUBLES);
  assert.equal(h.fn('normalizeScoring')('handicap'), h.bound.SCORING_TAGS);
  assert.equal(h.fn('normalizeScoring')(h.bound.SCORING_POINTS), h.bound.SCORING_POINTS);

  // A typo must not silently become the other live value.
  assert.notEqual(h.fn('normalizeFormat')('triples'), h.bound.LEAGUE_FORMAT_DOUBLES);
  assert.notEqual(h.fn('normalizeScoring')('handicap'), h.bound.SCORING_POINTS);

  assert.ok(
    h.loggerLines.some((line) => /Unknown league format "triples"/.test(line)),
    'an unknown format must be logged'
  );
  assert.ok(
    h.loggerLines.some((line) => /Unknown league scoring "handicap"/.test(line)),
    'an unknown scoring method must be logged'
  );
});

test('normalization stays silent for absent values and allow-listed values', () => {
  const h = loadCode();

  assert.equal(h.fn('normalizeFormat')(null), h.bound.LEAGUE_FORMAT_SINGLES);
  assert.equal(h.fn('normalizeScoring')(undefined), h.bound.SCORING_TAGS);
  assert.deepEqual(h.loggerLines, []);
});
