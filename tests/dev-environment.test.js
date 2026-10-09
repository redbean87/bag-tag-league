'use strict';

// Dev/prod environment split for the admin league picker.
//
// The app is served from two addresses: the live worker (`bag-tag-league`) and
// a development worker (`bag-tag-league-dev`) that shares the same static
// assets. Each league belongs to exactly one environment: the production
// address lists only production leagues, the development address only
// development (POC) leagues, and no league appears on both. The environment
// resolves from the serving hostname and must fail safe to production whenever
// the environment cannot be determined.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const LeagueFormat = require('../src/shared/league-format');
const { REPO_ROOT } = require('./helpers/load-code');

const TEST_SPREADSHEET_ID = '1c8QGftl2bKcLZeqwE2IyzAh5x4I22WRjSSgc7nGgeG8';
const PROD_DOUBLES_SPREADSHEET_ID = '1UPyr7AKEdFy7ypjrrtphpyjzs55YA2P57XOkESpsc1g';
const SINGLES_SPREADSHEET_ID = '1kgTRXIiyyXAzWdLf0q_dY-1U3tpKvPVTwYDl8Ok7lik';

const PROD_IDS = ['nightfliers-random-dubs'];
const DEV_IDS = ['b-rads-league', 'nightfliers-random-dubs-test'];

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

test('environmentForHost resolves the dev worker address and fails safe to production', () => {
  const dev = [
    'bag-tag-league-dev.acct.workers.dev',
    'bag-tag-league-dev.example.com',
    'dev.example.com',
    'BAG-TAG-LEAGUE-DEV.acct.workers.dev'
  ];
  for (const host of dev) {
    assert.equal(
      LeagueFormat.environmentForHost(host),
      LeagueFormat.ENVIRONMENTS.DEVELOPMENT,
      host + ' should resolve to development'
    );
  }

  const production = [
    'bag-tag-league.acct.workers.dev',
    'bag-tag-league.example.com',
    'unknown.example.com',
    'localhost',
    'development.example.com', // not a `dev.` label or `-dev` suffix
    ''
  ];
  for (const host of production) {
    assert.equal(
      LeagueFormat.environmentForHost(host),
      LeagueFormat.ENVIRONMENTS.PRODUCTION,
      JSON.stringify(host) + ' should resolve to production'
    );
  }

  // Missing or non-string hosts cannot be identified, so they are production.
  assert.equal(LeagueFormat.environmentForHost(undefined), LeagueFormat.ENVIRONMENTS.PRODUCTION);
  assert.equal(LeagueFormat.environmentForHost(null), LeagueFormat.ENVIRONMENTS.PRODUCTION);
  assert.equal(LeagueFormat.environmentForHost(42), LeagueFormat.ENVIRONMENTS.PRODUCTION);
});

test('the development address lists only the development (POC) leagues', () => {
  const selectable = LeagueFormat.selectableLeagues(LeagueFormat.ENVIRONMENTS.DEVELOPMENT);
  const ids = selectable.map((league) => league.id);

  assert.deepEqual(ids, DEV_IDS);
  for (const league of selectable) {
    assert.equal(league.environment, LeagueFormat.ENVIRONMENTS.DEVELOPMENT);
  }

  // The production doubles league is never offered on the development address.
  assert.equal(ids.includes('nightfliers-random-dubs'), false);
  // The two development surfaces bind the POC workbooks.
  assert.equal(LeagueFormat.leagueById('b-rads-league').spreadsheetId, SINGLES_SPREADSHEET_ID);
  assert.equal(LeagueFormat.leagueById('nightfliers-random-dubs-test').spreadsheetId, TEST_SPREADSHEET_ID);
});

test('the production address lists only the production league', () => {
  const selectable = LeagueFormat.selectableLeagues(LeagueFormat.ENVIRONMENTS.PRODUCTION);

  assert.deepEqual(selectable.map((league) => league.id), PROD_IDS);
  assert.equal(selectable[0].environment, LeagueFormat.ENVIRONMENTS.PRODUCTION);
  assert.equal(selectable[0].spreadsheetId, PROD_DOUBLES_SPREADSHEET_ID);
  assert.equal(
    LeagueFormat.spreadsheetIdForLeague('nightfliers-random-dubs'),
    PROD_DOUBLES_SPREADSHEET_ID
  );

  // No development surface is ever offered on production.
  assert.equal(
    selectable.some((league) => league.environment === LeagueFormat.ENVIRONMENTS.DEVELOPMENT),
    false
  );
  for (const league of selectable) {
    assert.notEqual(league.spreadsheetId, TEST_SPREADSHEET_ID);
    assert.notEqual(league.spreadsheetId, SINGLES_SPREADSHEET_ID);
  }
});

test('no league is visible on both addresses', () => {
  const prod = LeagueFormat.selectableLeagues(LeagueFormat.ENVIRONMENTS.PRODUCTION).map((l) => l.id);
  const dev = LeagueFormat.selectableLeagues(LeagueFormat.ENVIRONMENTS.DEVELOPMENT).map((l) => l.id);

  assert.deepEqual(prod.filter((id) => dev.includes(id)), []);
  // Every registered league is classified into exactly one environment.
  assert.equal(prod.length + dev.length, LeagueFormat.leagues().length);
});

test('the default selection follows the visible set in each environment', () => {
  assert.equal(
    LeagueFormat.defaultLeagueId(LeagueFormat.ENVIRONMENTS.PRODUCTION),
    'nightfliers-random-dubs'
  );
  assert.equal(
    LeagueFormat.defaultLeagueId(LeagueFormat.ENVIRONMENTS.DEVELOPMENT),
    'b-rads-league'
  );

  // The default is always the first visible league, never a hidden one.
  for (const environment of [LeagueFormat.ENVIRONMENTS.PRODUCTION, LeagueFormat.ENVIRONMENTS.DEVELOPMENT]) {
    const visible = LeagueFormat.selectableLeagues(environment);
    assert.equal(LeagueFormat.defaultLeagueId(environment), visible[0].id);
    assert.ok(visible.some((league) => league.id === LeagueFormat.defaultLeagueId(environment)));
  }
});

test('an unknown environment or explicit staging behaves as production', () => {
  for (const environment of ['staging', 'test', 'DEV', 'development ', true]) {
    assert.deepEqual(
      LeagueFormat.selectableLeagues(environment).map((l) => l.id),
      PROD_IDS,
      JSON.stringify(environment) + ' must resolve to production'
    );
  }
});

test('selectableLeagueById refuses a league from the other address', () => {
  assert.equal(
    LeagueFormat.selectableLeagueById('nightfliers-random-dubs', LeagueFormat.ENVIRONMENTS.PRODUCTION).id,
    'nightfliers-random-dubs'
  );
  assert.equal(
    LeagueFormat.selectableLeagueById('b-rads-league', LeagueFormat.ENVIRONMENTS.PRODUCTION),
    null
  );
  assert.equal(
    LeagueFormat.selectableLeagueById('nightfliers-random-dubs', LeagueFormat.ENVIRONMENTS.DEVELOPMENT),
    null
  );
});

test('currentEnvironment reads the serving host and defaults to production', () => {
  const originalWindow = global.window;
  const withHost = (hostname) => {
    global.window = { location: { hostname } };
  };

  try {
    withHost('bag-tag-league-dev.acct.workers.dev');
    assert.equal(LeagueFormat.currentEnvironment(), LeagueFormat.ENVIRONMENTS.DEVELOPMENT);
    assert.deepEqual(
      LeagueFormat.selectableLeagues().map((league) => league.id),
      DEV_IDS,
      'the dev address must offer only the development leagues through the no-argument picker call'
    );

    withHost('bag-tag-league.acct.workers.dev');
    assert.equal(LeagueFormat.currentEnvironment(), LeagueFormat.ENVIRONMENTS.PRODUCTION);
    assert.deepEqual(LeagueFormat.selectableLeagues().map((league) => league.id), PROD_IDS);

    // A window that cannot supply a hostname is undetermined -> production.
    global.window = { location: {} };
    assert.equal(LeagueFormat.currentEnvironment(), LeagueFormat.ENVIRONMENTS.PRODUCTION);
    assert.deepEqual(LeagueFormat.selectableLeagues().map((league) => league.id), PROD_IDS);

    // No window at all (for example the test runner) -> production.
    delete global.window;
    assert.equal(LeagueFormat.currentEnvironment(), LeagueFormat.ENVIRONMENTS.PRODUCTION);
    assert.deepEqual(LeagueFormat.selectableLeagues().map((league) => league.id), PROD_IDS);
  } finally {
    if (originalWindow === undefined) {
      delete global.window;
    } else {
      global.window = originalWindow;
    }
  }
});

test('stored selection never resolves to a league hidden on the serving address', () => {
  const originalWindow = global.window;
  try {
    // A dev league stored, then visited on production, falls back to the
    // production default rather than selecting a hidden league.
    global.window = { location: { hostname: 'bag-tag-league.acct.workers.dev' } };
    assert.equal(
      LeagueFormat.readStoredLeagueId(makeStorage({ [LeagueFormat.STORAGE_KEY]: 'b-rads-league' })),
      'nightfliers-random-dubs'
    );

    // A production league stored, then visited on dev, falls back to the dev
    // default.
    global.window = { location: { hostname: 'bag-tag-league-dev.acct.workers.dev' } };
    assert.equal(
      LeagueFormat.readStoredLeagueId(makeStorage({ [LeagueFormat.STORAGE_KEY]: 'nightfliers-random-dubs' })),
      'b-rads-league'
    );
  } finally {
    if (originalWindow === undefined) {
      delete global.window;
    } else {
      global.window = originalWindow;
    }
  }
});

test('the wrangler config deploys prod and dev workers from one assets source', () => {
  const config = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'wrangler.jsonc'), 'utf8'));

  assert.equal(config.name, 'bag-tag-league');
  assert.equal(config.env.dev.name, 'bag-tag-league-dev');
  // Both addresses serve the same source tree; the dev target adds no copy.
  assert.equal(typeof config.assets.directory, 'string');
  assert.equal(config.env.dev.assets.directory, config.assets.directory);
});

test('the admin QR keeps building the sign-in link from the serving origin', () => {
  const html = fs.readFileSync(path.join(REPO_ROOT, 'src', 'admin', 'index.html'), 'utf8');

  assert.match(html, /var PLAYER_SIGN_IN_PATH = '\/player\/sign-in\/'/);
  assert.match(
    html,
    /var url = window\.location\.origin \+ PLAYER_SIGN_IN_PATH \+ '\?league=' \+ encodeURIComponent\(getLeagueId\(\)\);/
  );
  // No hardcoded host, so a dev-origin page produces dev-origin QR codes.
  assert.doesNotMatch(html, /https?:\/\/[^'"]*bag-tag-league[^'"]*player\/sign-in/);
});
