'use strict';

// Data-driven check-in money options. The options a league offers come from its
// own settings: Paid is always offered, Ace Pot only when the league sets an
// ace pot contribution above zero, and CTP only when it sets a CTP contribution
// above zero. The explanation beside the options is the league's own text with
// a sensible default. The server refuses an option the league does not offer.
// Runs in a Node VM with in-memory Sheets fakes; no live sheet is touched.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadCode, REPO_ROOT } = require('./helpers/load-code');

const WEEK_DATE = '2026-10-05';
const SIGN_IN_HTML = fs.readFileSync(
  path.join(REPO_ROOT, 'src', 'player', 'sign-in', 'index.html'),
  'utf8'
);

/**
 * Builds a doubles spreadsheet with one member, one week tab, and a League
 * settings row so the check-in option resolvers have real league data.
 */
function buildDoubles(h, leagueSettings) {
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);

  const club = doubles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS_DOUBLES);
  club.appendRow([1, 'Damon Forsythe', 'damon31', '151236', true, '', '', 0]);

  const week = doubles.insertSheet('Week ' + WEEK_DATE);
  week.appendRow(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES);

  const league = doubles.insertSheet('League');
  league.appendRow(h.bound.LEAGUE_SHEET_HEADERS_DOUBLES);
  const row = new Array(h.bound.LEAGUE_SHEET_HEADERS_DOUBLES.length).fill('');
  for (const key in leagueSettings) {
    const index = h.bound.LEAGUE_SHEET_HEADERS_DOUBLES.indexOf(key);
    if (index !== -1) row[index] = leagueSettings[key];
  }
  league.appendRow(row);

  return { doubles, club, week, league };
}

function getOptions(h, settings) {
  buildDoubles(h, settings);
  return h.parse(h.fn('handleGetCheckInOptions')({ league: h.bound.LEAGUE_ID_DOUBLES }));
}

function checkIn(h, payload) {
  return h.parse(h.fn('handleSubmitCheckIn')(Object.assign({
    league: h.bound.LEAGUE_ID_DOUBLES,
    member_number: 1,
    name: 'Damon Forsythe',
    paid: true
  }, payload || {})));
}

// ─── Option resolution (pure) ────────────────────────────────────────────────

test('Paid is always offered and an unset pot is never offered', () => {
  const h = loadCode();
  const resolve = h.fn('resolveCheckInOptions');

  assert.deepEqual(resolve({}), {
    paid: true,
    ctp: false,
    ace_pot: false,
    money_explanation: h.bound.DEFAULT_ENTRY_FEE_EXPLANATION
  });
  assert.deepEqual(resolve(null), {
    paid: true,
    ctp: false,
    ace_pot: false,
    money_explanation: h.bound.DEFAULT_ENTRY_FEE_EXPLANATION
  });
});

test('a points league with an ace pot offers Paid and Ace Pot but no CTP', () => {
  const h = loadCode();
  const resolve = h.fn('resolveCheckInOptions');

  assert.deepEqual(resolve({ ace_pot_contribution: 1 }), {
    paid: true,
    ctp: false,
    ace_pot: true,
    money_explanation: h.bound.DEFAULT_ENTRY_FEE_EXPLANATION
  });
});

test('a league that configures CTP offers it, and zero or malformed stays off', () => {
  const h = loadCode();
  const resolve = h.fn('resolveCheckInOptions');

  assert.equal(resolve({ ace_pot_contribution: 1, ctp_contribution: 2 }).ctp, true);
  assert.equal(resolve({ ace_pot_contribution: '3' }).ace_pot, true);
  assert.equal(resolve({ ace_pot_contribution: 0, ctp_contribution: 0 }).ctp, false);
  assert.equal(resolve({ ctp_contribution: 'nonsense' }).ctp, false);
});

// ─── The server's public view of the options ─────────────────────────────────

test('getCheckInOptions reports a points league as Paid and Ace Pot only', () => {
  const h = loadCode();
  const result = getOptions(h, { ace_pot_contribution: 1, ctp_contribution: 0 });

  assert.equal(result.status, 'ok');
  assert.deepEqual(result.options, { paid: true, ctp: false, ace_pot: true });
  assert.equal(result.money_explanation, h.bound.DEFAULT_ENTRY_FEE_EXPLANATION);
});

test('the explanation round-trips through the settings save and the admin form', () => {
  const h = loadCode();
  h.fn('handleCreateLeagueSheet')({ league: h.bound.LEAGUE_ID_DOUBLES });

  const saved = h.parse(h.fn('handleSaveLeagueSettings')({
    league: h.bound.LEAGUE_ID_DOUBLES,
    settings: { entry_fee_explanation: 'Pays the pot.' }
  }));
  assert.equal(saved.status, 'ok');
  assert.equal(saved.settings.entry_fee_explanation, 'Pays the pot.');

  const loaded = h.parse(h.fn('handleGetLeagueSettings')({ league: h.bound.LEAGUE_ID_DOUBLES }));
  assert.equal(loaded.settings.entry_fee_explanation, 'Pays the pot.');

  const adminHtml = fs.readFileSync(path.join(REPO_ROOT, 'src', 'admin', 'index.html'), 'utf8');
  assert.match(adminHtml, /id="entry_fee_explanation"/);
  assert.match(
    adminHtml,
    /entry_fee_explanation: document\.getElementById\('entry_fee_explanation'\)\.value\.trim\(\),/
  );
});

test('getCheckInOptions reports CTP and the league explanation once configured', () => {
  const h = loadCode();
  const result = getOptions(h, {
    ace_pot_contribution: 1,
    ctp_contribution: 3,
    entry_fee_explanation: 'Your fee pays the winners and the ace pot.'
  });

  assert.deepEqual(result.options, { paid: true, ctp: true, ace_pot: true });
  assert.equal(result.money_explanation, 'Your fee pays the winners and the ace pot.');
});

// ─── The server refuses an option the league does not offer ──────────────────

test('a check-in cannot submit CTP when the league does not offer it', () => {
  const h = loadCode();
  buildDoubles(h, { ace_pot_contribution: 1, ctp_contribution: 0 });

  const rejected = checkIn(h, { ctp: true });
  assert.equal(rejected.status, 'error');
  assert.match(rejected.message, /CTP/);

  // Dropping the disallowed option lets the same player check in.
  const accepted = checkIn(h);
  assert.equal(accepted.status, 'ok');
});

test('a check-in cannot submit an Ace Pot when the league does not offer it', () => {
  const h = loadCode();
  buildDoubles(h, { ace_pot_contribution: 0, ctp_contribution: 0 });

  const rejected = checkIn(h, { ace_pot: true });
  assert.equal(rejected.status, 'error');
  assert.match(rejected.message, /Ace Pot/);
});

test('a check-in may submit the options the league actually offers', () => {
  const h = loadCode();
  buildDoubles(h, { ace_pot_contribution: 1, ctp_contribution: 1 });

  const accepted = checkIn(h, { ctp: true, ace_pot: true });
  assert.equal(accepted.status, 'ok');
});

// ─── The sign-in form renders and submits from league data ───────────────────

function functionBody(name) {
  const start = SIGN_IN_HTML.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'expected function ' + name);
  const next = SIGN_IN_HTML.indexOf('\n    function ', start + 1);
  return SIGN_IN_HTML.slice(start, next === -1 ? undefined : next);
}

function loadMoneyHelpers() {
  const names = ['checkInOptionsFrom', 'applyMoneyOptionsToDom'];
  const source = names.map(functionBody).join('\n') +
    '\nreturn {' + names.join(', ') + '};';
  return new Function('document', source);
}

function fakeDocument() {
  const elements = {};
  return {
    elements,
    getElementById(id) {
      if (!elements[id]) {
        elements[id] = { id, style: {}, textContent: '', checked: false };
      }
      return elements[id];
    }
  };
}

test('the form shows Paid and Ace Pot but hides CTP for a points league', () => {
  const document = fakeDocument();
  const helpers = loadMoneyHelpers()(document);

  helpers.applyMoneyOptionsToDom(helpers.checkInOptionsFrom({
    options: { paid: true, ctp: false, ace_pot: true },
    money_explanation: 'Pays the weekly winners.'
  }));

  assert.equal(document.elements.checkInCtpLabel.style.display, 'none');
  assert.equal(document.elements.registerCtpLabel.style.display, 'none');
  assert.equal(document.elements.checkInAcePotLabel.style.display, '');
  assert.equal(document.elements.registerAcePotLabel.style.display, '');
});

test('the form shows CTP when the league configures it', () => {
  const document = fakeDocument();
  const helpers = loadMoneyHelpers()(document);

  helpers.applyMoneyOptionsToDom(helpers.checkInOptionsFrom({
    options: { paid: true, ctp: true, ace_pot: true },
    money_explanation: 'Pays the CTP too.'
  }));

  assert.equal(document.elements.checkInCtpLabel.style.display, '');
  assert.equal(document.elements.registerCtpLabel.style.display, '');
});

test('the explanation renders from league data beside the options', () => {
  const document = fakeDocument();
  const helpers = loadMoneyHelpers()(document);

  helpers.applyMoneyOptionsToDom(helpers.checkInOptionsFrom({
    options: { paid: true, ctp: false, ace_pot: true },
    money_explanation: 'Your entry fee pays the weekly winning team.'
  }));

  assert.equal(
    document.elements.checkInMoneyExplanation.textContent,
    'Your entry fee pays the weekly winning team.'
  );
  assert.equal(
    document.elements.registerMoneyExplanation.textContent,
    'Your entry fee pays the weekly winning team.'
  );
});

test('a hidden option is cleared and never sent from the sign-in page', () => {
  const document = fakeDocument();
  const helpers = loadMoneyHelpers()(document);
  document.getElementById('checkInCtp').checked = true;

  helpers.applyMoneyOptionsToDom(helpers.checkInOptionsFrom({
    options: { paid: true, ctp: false, ace_pot: false },
    money_explanation: ''
  }));

  assert.equal(document.getElementById('checkInCtp').checked, false);
  assert.match(SIGN_IN_HTML, /if \(moneyOptions\.ctp\) payload\.ctp = ctp;/);
  assert.match(SIGN_IN_HTML, /if \(moneyOptions\.ace_pot\) payload\.ace_pot = acePot;/);
  assert.match(SIGN_IN_HTML, /action: 'getCheckInOptions', league: resolvedLeague\.id/);
});
