'use strict';

// Player sign-in roster preload. The page fetches the league roster once at
// page open with the existing listClubMembers action, concurrently with the
// check-in options call, and answers every subsequent player search in the
// browser. Before the preload settles, or after it fails, search keeps the
// existing server path (searchClubMembers) with its stale-query guard. The
// preloaded copy is page-memory only and is never trusted at submission: the
// server still revalidates identity, activity, money options, and tag rules.
// The filter mirrors handleSearchClubMembers matching and result shape, so
// rendering and selection behave identically from either source. Runs in
// Node against the pure module plus structural checks on the page; no
// browser, no live backend.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const RosterSearch = require('../src/player/sign-in/roster-search');
const { REPO_ROOT } = require('./helpers/load-code');

const SIGN_IN_HTML = fs.readFileSync(
  path.join(REPO_ROOT, 'src', 'player', 'sign-in', 'index.html'),
  'utf8'
);

// The inline body of a page function, sliced up to the next same-indent
// function declaration.
function functionBody(name) {
  const start = SIGN_IN_HTML.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'expected function ' + name);
  const next = SIGN_IN_HTML.indexOf('\n    function ', start + 1);
  return SIGN_IN_HTML.slice(start, next === -1 ? undefined : next);
}

function member(overrides) {
  return Object.assign({
    member_number: 1,
    name: 'Ada Example',
    udisc_username: 'ada77',
    pdga_number: '12345',
    is_active: true,
    created_at: ''
  }, overrides || {});
}

function rosterPayload(members) {
  return { status: 'ok', message: 'Members loaded.', league: 'l1', format: 'singles', members };
}

// ─── Preload response validation ────────────────────────────────────────────

test('a valid roster payload yields its selectable members', () => {
  const members = RosterSearch.selectableMembers(rosterPayload([member()]));
  assert.deepEqual(members, [member()]);
});

test('inactive members are dropped from the selectable roster', () => {
  const members = RosterSearch.selectableMembers(rosterPayload([
    member(),
    member({ member_number: 2, name: 'Retired Player', is_active: false }),
    member({ member_number: 3, name: 'Sheet String False', is_active: 'FALSE' }),
    member({ member_number: 4, name: 'Sheet String True', is_active: 'TRUE' })
  ]));
  assert.deepEqual(members.map((m) => m.member_number), [1, 4]);
});

test('a points-league roster keeps season_points and drops the tag field', () => {
  const members = RosterSearch.selectableMembers(rosterPayload([
    member({ season_points: 7 })
  ]));
  assert.equal(members[0].season_points, 7);
  assert.equal(members[0].current_tag, undefined);
});

test('malformed or incomplete payloads are preload failures, never an empty roster', () => {
  assert.equal(RosterSearch.selectableMembers(null), null);
  assert.equal(RosterSearch.selectableMembers(undefined), null);
  assert.equal(RosterSearch.selectableMembers({ status: 'error', members: [] }), null);
  assert.equal(RosterSearch.selectableMembers({ status: 'ok' }), null);
  assert.equal(RosterSearch.selectableMembers({ status: 'ok', members: 'none' }), null);
  assert.equal(RosterSearch.selectableMembers({ status: 'ok', members: [null] }), null);
  assert.equal(RosterSearch.selectableMembers({ status: 'ok', members: ['x'] }), null);
  // member_number is the submitted identity; a member without it is invalid.
  assert.equal(RosterSearch.selectableMembers({ status: 'ok', members: [{ name: 'A' }] }), null);
  assert.equal(RosterSearch.selectableMembers({ status: 'ok', members: [{ member_number: 1 }] }), null);
});

test('an ok payload with a genuinely empty roster is ready and empty', () => {
  assert.deepEqual(RosterSearch.selectableMembers(rosterPayload([])), []);
});

// ─── Client-side matching (mirrors handleSearchClubMembers) ─────────────────

test('search matches name, UDisc username, and PDGA number case-insensitively', () => {
  const roster = [
    member(),
    member({ member_number: 2, name: 'Bob', udisc_username: 'BOBdisc', pdga_number: '' }),
    member({ member_number: 3, name: 'Cara', udisc_username: '', pdga_number: '9999' })
  ];

  assert.deepEqual(RosterSearch.filterMembers(roster, 'ada').map((m) => m.member_number), [1]);
  assert.deepEqual(RosterSearch.filterMembers(roster, 'ADA').map((m) => m.member_number), [1]);
  assert.deepEqual(RosterSearch.filterMembers(roster, 'disc').map((m) => m.member_number), [2]);
  assert.deepEqual(RosterSearch.filterMembers(roster, '9999').map((m) => m.member_number), [3]);
  assert.deepEqual(RosterSearch.filterMembers(roster, 'nomatch'), []);
});

test('a query under the minimum length matches nothing', () => {
  assert.deepEqual(RosterSearch.filterMembers([member()], ''), []);
  assert.deepEqual(RosterSearch.filterMembers([member()], ' a '), []);
  assert.equal(RosterSearch.MIN_QUERY_LENGTH, 2);
});

test('results keep roster order, stop at the limit, and match the server shape', () => {
  const roster = [];
  for (let i = 1; i <= 15; i++) {
    roster.push(member({ member_number: i, name: 'Team ' + i }));
  }
  const results = RosterSearch.filterMembers(roster, 'team');

  assert.equal(results.length, RosterSearch.RESULT_LIMIT);
  assert.equal(results.length, 10);
  assert.deepEqual(results.map((m) => m.member_number), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(Object.keys(results[0]).sort(), [
    'current_tag', 'member_number', 'name', 'pdga_number', 'season_points', 'udisc_username'
  ]);
});

test('selection identity survives filtering: member_number and roster fields intact', () => {
  const roster = [member({ member_number: 42, name: 'Cortez Ashley', current_tag: 20 })];
  const [result] = RosterSearch.filterMembers(roster, 'cortez');

  assert.equal(result.member_number, 42);
  assert.equal(result.name, 'Cortez Ashley');
  assert.equal(result.udisc_username, 'ada77');
  assert.equal(result.current_tag, 20);
});

// ─── Page wiring: concurrent boot, local search, server fallback ────────────

test('the roster script is loaded on the sign-in page', () => {
  assert.match(SIGN_IN_HTML, /<script src="roster-search\.js"><\/script>/);
});

test('page init starts the roster preload independently of the options call', () => {
  assert.match(SIGN_IN_HTML, /loadCheckInOptions\(\);\s*\n\s*loadRoster\(\);/);
  // Neither boot call waits on the other, and nothing batches them into one
  // action: the roster request sits outside the options call entirely.
  const optionsBody = functionBody('loadCheckInOptions')
    .split('// --- Roster preload ---')[0];
  assert.doesNotMatch(optionsBody, /listClubMembers|loadRoster/);
  const rosterBody = functionBody('loadRoster');
  assert.doesNotMatch(rosterBody, /getCheckInOptions|loadCheckInOptions/);
});

test('the preload POSTs the existing listClubMembers action with the resolved league', () => {
  const body = functionBody('loadRoster');
  assert.match(body, /action: 'listClubMembers',\s*league: resolvedLeague\.id/);
  assert.match(body, /fetch\(API_URL/);
});

test('the roster is page-memory only and only ready after shape validation', () => {
  assert.match(SIGN_IN_HTML, /var roster = \{ status: 'pending', members: \[\] \};/);
  assert.doesNotMatch(SIGN_IN_HTML, /localStorage|sessionStorage/);
  const body = functionBody('loadRoster');
  // Ready only through the validated selectableMembers path; errors and
  // malformed payloads land on failed, never on a usable empty roster.
  assert.match(body, /RosterSearch\.selectableMembers\(data\)/);
  assert.match(body, /roster = \{ status: 'failed', members: \[\] \};/);
});

test('a ready roster answers search in the browser with no network request', () => {
  const body = functionBody('performSearch');
  const localRender = body.indexOf('renderLocalSearchResults');
  const fetchIndex = body.indexOf('fetch(API_URL');
  assert.notEqual(localRender, -1);
  assert.notEqual(fetchIndex, -1);
  assert.ok(localRender < fetchIndex, 'local render must come before any fetch');
  assert.match(body, /if \(roster\.status === 'ready'\) \{\s*\n\s*renderLocalSearchResults\(query\);\s*\n\s*return;/);
});

test('the server search fallback stays intact with its stale-query guard', () => {
  const body = functionBody('performSearch');
  assert.match(body, /action: 'searchClubMembers',\s*league: resolvedLeague\.id/);
  assert.match(body, /activeSearchQuery = query;/);
  assert.match(body, /if \(activeSearchQuery !== query\) return;/);
  assert.match(body, /setStatus\('searchStatus', 'error', 'Search failed\. Please try again\.'\)/);
});

test('the local render reuses the existing result rendering and no-match message', () => {
  const body = functionBody('renderLocalSearchResults');
  assert.match(body, /RosterSearch\.filterMembers\(roster\.members, query\)/);
  assert.match(body, /renderSearchResults\(results\)/);
  assert.match(body, /noResultsMessage/);
});

test('the 250 ms debounce and minimum-length gate are unchanged', () => {
  const body = functionBody('onSearchInput');
  assert.match(body, /performSearch\(query\);\s*\}, 250\)/);
  assert.match(body, /query\.length < 2/);
});

// ─── Submission untouched by the preload ────────────────────────────────────

test('submission preparation is unchanged and never reads the roster', () => {
  const body = functionBody('submitCheckIn');
  assert.doesNotMatch(body, /roster|RosterSearch|listClubMembers/);
  assert.match(body, /if \(selectedMemberNumber\) \{\s*\n\s*payload\.member_number = selectedMemberNumber;/);
  assert.match(body, /action: 'submitCheckIn',\s*league: resolvedLeague\.id/);
  assert.doesNotMatch(SIGN_IN_HTML, /payload\.ace_pot/);
});

test('selection still populates the form from the result record alone', () => {
  const body = functionBody('selectMember');
  assert.doesNotMatch(body, /fetch|roster\.members/);
  assert.match(body, /selectedMemberNumber = member\.member_number;/);
  assert.match(body, /document\.getElementById\('checkInName'\)\.value = member\.name;/);
});
