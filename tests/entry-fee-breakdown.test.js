'use strict';

// Data-driven entry-fee breakdown. The parts of the per-player entry fee come
// from the league's own settings as an ordered "label:amount,..." list, are
// rendered beside the check-in payment options, and warn the coordinator when
// their total does not match the configured entry fee. The mismatch is a
// warning, never a save gate. Runs in a Node VM with in-memory Sheets fakes;
// no live sheet is touched.

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
const ADMIN_HTML = fs.readFileSync(
  path.join(REPO_ROOT, 'src', 'admin', 'index.html'),
  'utf8'
);

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

// ─── Parsing and totals (pure) ───────────────────────────────────────────────

test('parseEntryFeeBreakdown keeps the ordered label and amount parts', () => {
  const h = loadCode();
  const parsed = h.fn('parseEntryFeeBreakdown')(
    'Weekly payouts:2,Season payout:1,Ace pot:1,Club fees:1'
  );

  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.components, [
    { label: 'Weekly payouts', amount: 2 },
    { label: 'Season payout', amount: 1 },
    { label: 'Ace pot', amount: 1 },
    { label: 'Club fees', amount: 1 }
  ]);
});

test('parseEntryFeeBreakdown treats blank as no breakdown and rejects malformed parts', () => {
  const h = loadCode();
  const parse = h.fn('parseEntryFeeBreakdown');

  assert.deepEqual(parse(''), { ok: true, components: [] });
  assert.deepEqual(parse(null), { ok: true, components: [] });

  assert.equal(parse('Weekly').ok, false);
  assert.equal(parse('Weekly:two').ok, false);
  assert.equal(parse('Weekly:-1').ok, false);
  assert.equal(parse(':2').ok, false);
  assert.equal(parse('Weekly:2,,Season:1').ok, false);
});

test('resolveEntryFeeBreakdown totals the parts and a malformed value yields none', () => {
  const h = loadCode();
  const resolve = h.fn('resolveEntryFeeBreakdown');

  assert.deepEqual(resolve({ entry_fee_breakdown: 'Weekly payouts:2,Season payout:1,Ace pot:1,Club fees:1' }), {
    components: [
      { label: 'Weekly payouts', amount: 2 },
      { label: 'Season payout', amount: 1 },
      { label: 'Ace pot', amount: 1 },
      { label: 'Club fees', amount: 1 }
    ],
    total: 5
  });
  assert.deepEqual(resolve({}), { components: [], total: 0 });
  assert.deepEqual(resolve(null), { components: [], total: 0 });
  assert.deepEqual(resolve({ entry_fee_breakdown: 'Weekly:two' }), { components: [], total: 0 });
});

test('entryFeeBreakdownMismatch names both numbers only when they differ', () => {
  const h = loadCode();
  const mismatch = h.fn('entryFeeBreakdownMismatch');
  const parts = h.fn('parseEntryFeeBreakdown')('Weekly payouts:2,Season payout:1,Ace pot:1').components;

  // 2 + 1 + 1 = 4 against a 5 fee.
  assert.deepEqual(mismatch(5, parts), { fee: 5, total: 4 });
  assert.equal(mismatch(4, parts), null, 'a matching total stays quiet');
  // A blank fee or no parts cannot disagree.
  assert.equal(mismatch('', parts), null);
  assert.equal(mismatch(5, []), null);
  assert.equal(mismatch(5, null), null);
});

// ─── The server's public check-in view ───────────────────────────────────────

test('getCheckInOptions returns the league breakdown beside the explanation', () => {
  const h = loadCode();
  buildDoubles(h, {
    entry_fee: 5,
    ace_pot_contribution: 1,
    entry_fee_explanation: 'Where your five dollars goes.',
    entry_fee_breakdown: 'Weekly payouts:2,Season payout:1,Ace pot:1,Club fees:1'
  });

  const result = h.parse(h.fn('handleGetCheckInOptions')({ league: h.bound.LEAGUE_ID_DOUBLES }));
  assert.equal(result.status, 'ok');
  assert.equal(result.money_explanation, 'Where your five dollars goes.');
  assert.deepEqual(result.money_breakdown, [
    { label: 'Weekly payouts', amount: 2 },
    { label: 'Season payout', amount: 1 },
    { label: 'Ace pot', amount: 1 },
    { label: 'Club fees', amount: 1 }
  ]);
});

test('getCheckInOptions returns no breakdown for a league that itemises nothing', () => {
  const h = loadCode();
  buildDoubles(h, { entry_fee: 5 });

  const result = h.parse(h.fn('handleGetCheckInOptions')({ league: h.bound.LEAGUE_ID_DOUBLES }));
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.money_breakdown, []);
});

// ─── Settings persistence and validation ─────────────────────────────────────

test('handleSaveLeagueSettings stores the breakdown and reads it back', () => {
  const h = loadCode();
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);
  h.fn('handleCreateLeagueSheet')({ spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES });

  const saved = h.parse(h.fn('handleSaveLeagueSettings')({
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    settings: { entry_fee_breakdown: 'Weekly payouts:2,Ace pot:2' }
  }));
  assert.equal(saved.status, 'ok');
  assert.equal(saved.settings.entry_fee_breakdown, 'Weekly payouts:2,Ace pot:2');

  const loaded = h.parse(h.fn('handleGetLeagueSettings')({
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES
  }));
  assert.equal(loaded.settings.entry_fee_breakdown, 'Weekly payouts:2,Ace pot:2');
  assert.deepEqual(h.fn('getSheetHeaders')(doubles.getSheetByName('League')), h.bound.LEAGUE_SHEET_HEADERS_DOUBLES);
});

test('handleSaveLeagueSettings rejects a malformed breakdown but accepts a mismatch', () => {
  const h = loadCode();
  h.fn('handleCreateLeagueSheet')({ spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES });

  const malformed = h.parse(h.fn('handleSaveLeagueSettings')({
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    settings: { entry_fee_breakdown: 'Weekly payouts:two' }
  }));
  assert.equal(malformed.status, 'error');
  assert.match(malformed.message, /entry_fee_breakdown/);

  // A breakdown that does not sum to the fee is still saved: the warning must
  // never block a coordinator mid-edit.
  const saved = h.parse(h.fn('handleSaveLeagueSettings')({
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    settings: { entry_fee: 5, entry_fee_breakdown: 'Weekly payouts:2,Ace pot:1' }
  }));
  assert.equal(saved.status, 'ok');
  assert.equal(saved.settings.entry_fee_breakdown, 'Weekly payouts:2,Ace pot:1');
});

test('handleSaveLeagueSettings appends the breakdown column to a pre-breakdown sheet', () => {
  const h = loadCode();
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);
  const league = doubles.insertSheet('League');
  // The 21-column schema from before entry_fee_breakdown existed.
  const preBreakdown = h.bound.LEAGUE_SHEET_HEADERS
    .concat(h.bound.LEAGUE_SHEET_METADATA_HEADERS)
    .concat(h.bound.LEAGUE_POINTS_HEADERS)
    .concat(h.bound.LEAGUE_PAYOUT_HEADERS)
    .concat(h.bound.LEAGUE_EXPLANATION_HEADERS);
  league.appendRow(preBreakdown);
  const row = new Array(preBreakdown.length).fill('');
  row[preBreakdown.indexOf('league_format')] = h.bound.LEAGUE_FORMAT_DOUBLES;
  row[preBreakdown.indexOf('scoring')] = h.bound.SCORING_POINTS;
  league.appendRow(row);

  const saved = h.parse(h.fn('handleSaveLeagueSettings')({
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    settings: { entry_fee_breakdown: 'Ace pot:1' }
  }));
  assert.equal(saved.status, 'ok');
  assert.deepEqual(h.fn('getSheetHeaders')(league), h.bound.LEAGUE_SHEET_HEADERS_DOUBLES);
  assert.equal(
    league.getRange(2, h.bound.LEAGUE_SHEET_HEADERS_DOUBLES.indexOf('entry_fee_breakdown') + 1).getValue(),
    'Ace pot:1'
  );
});

// ─── The sign-in form renders the breakdown from data ────────────────────────

function signInFunctionBody(name) {
  const start = SIGN_IN_HTML.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'expected function ' + name);
  const next = SIGN_IN_HTML.indexOf('\n    function ', start + 1);
  return SIGN_IN_HTML.slice(start, next === -1 ? undefined : next);
}

function loadSignInHelpers() {
  const names = ['checkInOptionsFrom', 'formatBreakdownAmount', 'applyMoneyOptionsToDom'];
  const source = names.map(signInFunctionBody).join('\n') +
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

test('the form renders each breakdown part from the league data', () => {
  const document = fakeDocument();
  const helpers = loadSignInHelpers()(document);

  helpers.applyMoneyOptionsToDom(helpers.checkInOptionsFrom({
    options: { paid: true, ctp: false, ace_pot: true },
    money_explanation: 'Where your five dollars goes.',
    money_breakdown: [
      { label: 'Weekly payouts', amount: 2 },
      { label: 'Season payout', amount: 1 },
      { label: 'Ace pot', amount: 1 },
      { label: 'Club fees', amount: 1 }
    ]
  }));

  assert.equal(
    document.elements.checkInMoneyBreakdown.textContent,
    'Weekly payouts \u2014 $2\nSeason payout \u2014 $1\nAce pot \u2014 $1\nClub fees \u2014 $1'
  );
  assert.equal(
    document.elements.registerMoneyBreakdown.textContent,
    document.elements.checkInMoneyBreakdown.textContent
  );
  assert.equal(document.elements.checkInMoneyBreakdown.style.display, '');
});

test('the form hides the breakdown when the league itemises nothing', () => {
  const document = fakeDocument();
  const helpers = loadSignInHelpers()(document);

  helpers.applyMoneyOptionsToDom(helpers.checkInOptionsFrom({
    options: { paid: true, ctp: false, ace_pot: false },
    money_explanation: '',
    money_breakdown: []
  }));

  assert.equal(document.elements.checkInMoneyBreakdown.textContent, '');
  assert.equal(document.elements.checkInMoneyBreakdown.style.display, 'none');
  assert.equal(document.elements.registerMoneyBreakdown.style.display, 'none');
});

test('the sign-in page carries the breakdown elements beside the options', () => {
  assert.match(SIGN_IN_HTML, /id="checkInMoneyBreakdown"/);
  assert.match(SIGN_IN_HTML, /id="registerMoneyBreakdown"/);
  assert.match(SIGN_IN_HTML, /data\.money_breakdown/);
});

// ─── The admin warning fires only on a mismatch ──────────────────────────────

function adminFunctionBody(name) {
  const start = ADMIN_HTML.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'expected function ' + name);
  const next = ADMIN_HTML.indexOf('\n    function ', start + 1);
  return ADMIN_HTML.slice(start, next === -1 ? undefined : next);
}

function loadAdminHelpers() {
  const names = [
    'entryFeeBreakdownFrom',
    'entryFeeBreakdownSum',
    'formatDollars',
    'entryFeeBreakdownWarning',
    'applyEntryFeeBreakdownWarning'
  ];
  const source = names.map(adminFunctionBody).join('\n') +
    '\nreturn {' + names.join(', ') + '};';
  return new Function('document', source);
}

test('the admin warning names both numbers when the parts do not match the fee', () => {
  const helpers = loadAdminHelpers()(fakeDocument());
  const warning = helpers.entryFeeBreakdownWarning(
    5,
    'Weekly payouts:2,Season payout:1,Ace pot:1'
  );

  assert.match(warning, /does not add up/i);
  assert.match(warning, /\$4/);
  assert.match(warning, /\$5/);
});

test('the admin warning stays quiet when the parts add up or are absent', () => {
  const helpers = loadAdminHelpers()(fakeDocument());

  assert.equal(
    helpers.entryFeeBreakdownWarning(5, 'Weekly payouts:2,Season payout:1,Ace pot:1,Club fees:1'),
    ''
  );
  assert.equal(helpers.entryFeeBreakdownWarning(5, ''), '');
  assert.equal(helpers.entryFeeBreakdownWarning('', 'Ace pot:1'), '');
  assert.equal(helpers.entryFeeBreakdownWarning(5, 'Weekly:two'), '');
});

test('the settings page shows the warning element on a mismatch and hides it on agreement', () => {
  const document = fakeDocument();
  const helpers = loadAdminHelpers()(document);

  helpers.applyEntryFeeBreakdownWarning({
    entry_fee: 5,
    entry_fee_breakdown: 'Weekly payouts:2,Ace pot:1'
  });
  assert.equal(document.elements.entryFeeBreakdownWarning.className, 'status warning');
  assert.match(document.elements.entryFeeBreakdownWarning.innerHTML, /\$3/);
  assert.match(document.elements.entryFeeBreakdownWarning.innerHTML, /\$5/);

  helpers.applyEntryFeeBreakdownWarning({
    entry_fee: 5,
    entry_fee_breakdown: 'Weekly payouts:2,Season payout:1,Ace pot:1,Club fees:1'
  });
  assert.equal(document.elements.entryFeeBreakdownWarning.className, 'status warning hidden');
  assert.equal(document.elements.entryFeeBreakdownWarning.innerHTML, '');
});

test('the admin form owns the breakdown field and never blocks the save on a mismatch', () => {
  assert.match(ADMIN_HTML, /id="entry_fee_breakdown"/);
  assert.match(ADMIN_HTML, /id="entryFeeBreakdownWarning"/);
  assert.match(ADMIN_HTML, /entry_fee_breakdown: document\.getElementById\('entry_fee_breakdown'\)\.value\.trim\(\),/);
  assert.match(ADMIN_HTML, /applyEntryFeeBreakdownWarning\(s\);/);
  // The warning copy is advisory; the normal save path is unchanged.
  assert.match(ADMIN_HTML, /setLeagueStatus\('ok', '<strong>Settings saved\.<\/strong>', 'leagueSaveResult'\);/);
});
