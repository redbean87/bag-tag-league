'use strict';

// Dev/prod environment split for the admin league picker.
//
// The app is served from two addresses: the live worker (`bag-tag-league`) and
// a development worker (`bag-tag-league-dev`) that shares the same static
// assets. Test-flagged POC leagues are offered only on the dev address. The
// environment resolves from the serving hostname and must fail safe to
// production whenever the environment cannot be determined.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const LeagueFormat = require('../src/shared/league-format');
const { REPO_ROOT } = require('./helpers/load-code');

const TEST_SPREADSHEET_ID = '1c8QGftl2bKcLZeqwE2IyzAh5x4I22WRjSSgc7nGgeG8';
const PROD_DOUBLES_SPREADSHEET_ID = '1UPyr7AKEdFy7ypjrrtphpyjzs55YA2P57XOkESpsc1g';
const SINGLES_SPREADSHEET_ID = '1kgTRXIiyyXAzWdLf0q_dY-1U3tpKvPVTwYDl8Ok7lik';

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

test('the development address lists test-flagged leagues alongside production ones', () => {
  const selectable = LeagueFormat.selectableLeagues(LeagueFormat.ENVIRONMENTS.DEVELOPMENT);
  const ids = selectable.map((league) => league.id);

  assert.ok(ids.includes('nightfliers-random-dubs-test'), 'dev must offer the POC test league');
  assert.ok(ids.includes('b-rads-league'), 'dev must keep offering the singles league');
  assert.ok(ids.includes('nightfliers-random-dubs'), 'dev must keep offering the production doubles league');
  assert.ok(selectable.some((league) => league.test === true), 'dev must expose test-flagged leagues');

  // The full registry is offered on dev, so nothing is dropped.
  assert.deepEqual(ids, LeagueFormat.leagues().map((league) => league.id));
});

test('the production address hides test leagues and binds only real sheets', () => {
  const selectable = LeagueFormat.selectableLeagues(LeagueFormat.ENVIRONMENTS.PRODUCTION);

  assert.ok(selectable.length > 0, 'production must still offer its leagues');
  assert.equal(selectable.some((league) => league.test === true), false, 'no test league may appear on prod');
  assert.deepEqual(
    selectable.map((league) => league.id),
    ['b-rads-league', 'nightfliers-random-dubs']
  );

  // Every production-visible record points at a real sheet, never the POC one.
  for (const league of selectable) {
    assert.notEqual(league.spreadsheetId, TEST_SPREADSHEET_ID);
  }
  assert.equal(
    LeagueFormat.spreadsheetIdForLeague('nightfliers-random-dubs'),
    PROD_DOUBLES_SPREADSHEET_ID
  );
  assert.equal(
    LeagueFormat.spreadsheetIdForLeague('b-rads-league'),
    SINGLES_SPREADSHEET_ID
  );
});

test('an unknown environment or explicit staging behaves as production', () => {
  for (const environment of ['staging', 'test', 'DEV', 'development ', true]) {
    const selectable = LeagueFormat.selectableLeagues(environment);
    assert.equal(
      selectable.some((league) => league.test === true),
      false,
      JSON.stringify(environment) + ' must not expose test leagues'
    );
  }
});

test('currentEnvironment reads the serving host and defaults to production', () => {
  const originalWindow = global.window;
  const withHost = (hostname) => {
    global.window = { location: { hostname } };
  };

  try {
    withHost('bag-tag-league-dev.acct.workers.dev');
    assert.equal(LeagueFormat.currentEnvironment(), LeagueFormat.ENVIRONMENTS.DEVELOPMENT);
    assert.ok(
      LeagueFormat.selectableLeagues().some((league) => league.test === true),
      'the dev address must expose the POC league through the no-argument picker call'
    );

    withHost('bag-tag-league.acct.workers.dev');
    assert.equal(LeagueFormat.currentEnvironment(), LeagueFormat.ENVIRONMENTS.PRODUCTION);
    assert.equal(
      LeagueFormat.selectableLeagues().some((league) => league.test === true),
      false,
      'the production address must hide the POC league'
    );

    // A window that cannot supply a hostname is undetermined -> production.
    global.window = { location: {} };
    assert.equal(LeagueFormat.currentEnvironment(), LeagueFormat.ENVIRONMENTS.PRODUCTION);
    assert.equal(LeagueFormat.selectableLeagues().some((league) => league.test === true), false);

    // No window at all (for example the test runner) -> production.
    delete global.window;
    assert.equal(LeagueFormat.currentEnvironment(), LeagueFormat.ENVIRONMENTS.PRODUCTION);
    assert.equal(LeagueFormat.selectableLeagues().some((league) => league.test === true), false);
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
