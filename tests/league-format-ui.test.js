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

test('singles is the default format for an empty or missing storage', () => {
  assert.equal(LeagueFormat.readStoredFormat(null), LeagueFormat.FORMATS.SINGLES);
  assert.equal(LeagueFormat.readStoredFormat(makeStorage({})), LeagueFormat.FORMATS.SINGLES);
});

test('the selected format persists across reloads', () => {
  const storage = makeStorage({});

  LeagueFormat.persistFormat(storage, LeagueFormat.FORMATS.DOUBLES);
  assert.equal(LeagueFormat.readStoredFormat(storage), LeagueFormat.FORMATS.DOUBLES);

  LeagueFormat.persistFormat(storage, LeagueFormat.FORMATS.SINGLES);
  assert.equal(LeagueFormat.readStoredFormat(storage), LeagueFormat.FORMATS.SINGLES);
});

test('an unknown stored value falls back to singles', () => {
  const storage = makeStorage({ [LeagueFormat.STORAGE_KEY]: 'nonsense' });
  assert.equal(LeagueFormat.readStoredFormat(storage), LeagueFormat.FORMATS.SINGLES);
});

test('storage failures fall back to singles instead of throwing', () => {
  const throwing = {
    getItem() {
      throw new Error('denied');
    },
    setItem() {
      throw new Error('denied');
    }
  };

  assert.equal(LeagueFormat.readStoredFormat(throwing), LeagueFormat.FORMATS.SINGLES);
  assert.equal(
    LeagueFormat.persistFormat(throwing, LeagueFormat.FORMATS.DOUBLES),
    LeagueFormat.FORMATS.DOUBLES
  );
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

test('the admin UI loads the shared selector and sends spreadsheetId on every action', () => {
  const html = fs.readFileSync(path.join(REPO_ROOT, 'src', 'admin', 'index.html'), 'utf8');

  assert.match(html, /src="\.\.\/shared\/league-format\.js"/);
  assert.match(html, /id="leagueFormat"/);
  assert.match(html, /<option value="singles">Singles<\/option>/);
  assert.match(html, /<option value="doubles">Doubles<\/option>/);
  assert.match(html, /function getSpreadsheetId\(\)/);
  assert.match(html, /function onLeagueFormatChange\(\)/);

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
