'use strict';

// Slices 2 and 3 of the data-driven league content: the provisioning card and
// the league-varying help copy are rendered from the selected league's record,
// capability rules, and loaded settings rather than hardcoded "Doubles"
// literals. This loads the real render helpers out of the admin page and runs
// them against a tiny fake DOM and the real shared league registry. No browser
// or network is involved.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const LeagueFormat = require('../src/shared/league-format');
const { REPO_ROOT } = require('./helpers/load-code');

const html = fs.readFileSync(path.join(REPO_ROOT, 'src', 'admin', 'index.html'), 'utf8');

function functionBody(name) {
  const start = html.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'expected function ' + name);
  const next = html.indexOf('\n    function ', start + 1);
  return html.slice(start, next === -1 ? undefined : next);
}

const COPY_FUNCTIONS = [
  'formatLabel',
  'ordinalLabel',
  'parsePointsSetting',
  'formatPointsCopy',
  'pointsCopyFromSettings',
  'sourceLeagueFor',
  'provisionCopy',
  'renderLeagueCopy'
];

function loadCopyHelpers() {
  const source = COPY_FUNCTIONS.map(functionBody).join('\n') +
    '\nreturn {' + COPY_FUNCTIONS.join(', ') + '};';
  return new Function('window', 'document', source);
}

function fakeDocument() {
  const elements = {};
  return {
    elements,
    getElementById(id) {
      if (!elements[id]) {
        elements[id] = { id, innerHTML: '', textContent: '', dataset: {}, style: {} };
      }
      return elements[id];
    }
  };
}

const doubles = LeagueFormat.leagues().find((league) => league.format === LeagueFormat.FORMATS.DOUBLES);
const singles = LeagueFormat.leagues().find((league) => league.format === LeagueFormat.FORMATS.SINGLES);
const doublesRules = LeagueFormat.rulesForLeague(doubles.id);
const singlesRules = LeagueFormat.rulesForLeague(singles.id);

test('the format label derives from the capability rules, not a league id', () => {
  const window = { LeagueFormat };
  const helpers = loadCopyHelpers()(window, fakeDocument());

  assert.equal(helpers.formatLabel(doublesRules), 'Doubles');
  assert.equal(helpers.formatLabel(singlesRules), 'Singles');
});

test('the points copy renders the default table when settings carry none', () => {
  const window = { LeagueFormat };
  const helpers = loadCopyHelpers()(window, fakeDocument());

  assert.equal(
    helpers.pointsCopyFromSettings({}),
    '1st=2, 2nd=1.5, 3rd=1, every other participant=0.5'
  );
  assert.equal(
    helpers.pointsCopyFromSettings(null),
    '1st=2, 2nd=1.5, 3rd=1, every other participant=0.5'
  );
});

test('the points copy renders a league override in place order', () => {
  const window = { LeagueFormat };
  const helpers = loadCopyHelpers()(window, fakeDocument());

  assert.equal(
    helpers.pointsCopyFromSettings({ points_by_place: '1:3,2:2', points_participation: 1 }),
    '1st=3, 2nd=2, every other participant=1'
  );
  // A malformed stored value degrades to the defaults instead of throwing.
  assert.equal(
    helpers.pointsCopyFromSettings({ points_by_place: 'nonsense' }),
    '1st=2, 2nd=1.5, 3rd=1, every other participant=0.5'
  );
});

test('provisioning copy names the league and its format from the registry record', () => {
  const window = { LeagueFormat };
  const helpers = loadCopyHelpers()(window, fakeDocument());

  const copy = helpers.provisionCopy(doubles, doublesRules);

  assert.equal(copy.title, doubles.name + ' Provisioning');
  assert.match(copy.help, /league_format=doubles/);
  assert.match(copy.help, new RegExp('the ' + doubles.name + ' spreadsheet'));
  // The roster seed source is the tags league, named rather than hardcoded.
  assert.match(copy.help, new RegExp('from the ' + singles.name + ' roster'));
  assert.ok(copy.idleButton.includes(doubles.name));
  assert.ok(copy.provisionedButton.includes(doubles.name));
});

test('renderLeagueCopy renders doubles copy from the league and its settings', () => {
  const window = { LeagueFormat };
  const document = fakeDocument();
  const helpers = loadCopyHelpers()(window, document);

  helpers.renderLeagueCopy(doubles, doublesRules, {
    points_by_place: '1:3',
    points_participation: 1,
    weekly_columns: 51
  });

  assert.match(document.getElementById('membersCardInfo').innerHTML, /Doubles season totals/);
  assert.match(document.getElementById('membersCardInfo').innerHTML, /Doubles members with their/);
  assert.match(
    document.getElementById('pointsCalcInfo').innerHTML,
    /Doubles weekly points: 1st=3, every other participant=1\./
  );
  assert.match(document.getElementById('createLeagueDayInfo').innerHTML, /51-column roster template/);
  assert.equal(document.getElementById('provisionCardTitle').textContent, doubles.name + ' Provisioning');
  assert.match(document.getElementById('doublesProvisionInfo').innerHTML, /league_format=doubles/);
  assert.equal(document.getElementById('btnProvisionDoubles').textContent, 'Provision ' + doubles.name + ' Spreadsheet');
});

test('renderLeagueCopy renders singles copy and a capability-derived column count', () => {
  const window = { LeagueFormat };
  const document = fakeDocument();
  const helpers = loadCopyHelpers()(window, document);

  helpers.renderLeagueCopy(singles, singlesRules, { weekly_columns: 48 });

  assert.match(document.getElementById('membersCardInfo').innerHTML, /Singles season totals/);
  assert.match(
    document.getElementById('pointsCalcInfo').innerHTML,
    /Singles weekly points: 1st=2, 2nd=1\.5, 3rd=1, every other participant=0\.5\./
  );
  assert.match(document.getElementById('createLeagueDayInfo').innerHTML, /48-column roster template/);
});

test('the admin page no longer carries the old hardcoded league copy literals', () => {
  assert.doesNotMatch(html, /Doubles season totals/);
  assert.doesNotMatch(html, /Doubles weekly points: 1st=2/);
  assert.doesNotMatch(html, /<h2>Doubles Provisioning<\/h2>/);
  assert.doesNotMatch(html, /standard 48-column roster template/);
});
