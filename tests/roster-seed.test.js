'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers/load-code');

function buildSingles(h) {
  const singles = h.makeSpreadsheet('singles-roster');
  const club = singles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS);
  club.appendRow([3, 'Alice', 'alice', '111', 5, true, 't1', 't1']);
  club.appendRow([7, 'Bob', 'bob', '222', 9, true, 't2', 't2']);
  club.appendRow([12, 'Cara', 'cara', '333', 1, false, 't3', 't3']);
  return singles;
}

function buildDoublesClubMembers(h) {
  const doubles = h.makeSpreadsheet('doubles-roster');
  const club = doubles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS);
  return { doubles, club };
}

test('roster seed preserves existing member_number values exactly', () => {
  const h = loadCode();
  const singles = buildSingles(h);
  const { doubles, club } = buildDoublesClubMembers(h);

  const result = h.fn('seedRosterFromSingles')(singles, doubles);

  assert.deepEqual(result.seeded_member_numbers, [3, 7, 12]);
  assert.equal(result.seeded, 3);
  assert.equal(result.skipped_existing, 0);

  const data = club.getDataRange().getValues();
  const memberCol = h.bound.CLUB_MEMBER_HEADERS.indexOf('member_number');
  const copiedNumbers = data.slice(1).map((row) => row[memberCol]);
  assert.deepEqual(copiedNumbers, [3, 7, 12], 'members must not be renumbered');
});

test('roster seed is idempotent and skips members already present', () => {
  const h = loadCode();
  const singles = buildSingles(h);
  const { doubles } = buildDoublesClubMembers(h);

  const first = h.fn('seedRosterFromSingles')(singles, doubles);
  const second = h.fn('seedRosterFromSingles')(singles, doubles);

  assert.equal(first.seeded, 3);
  assert.equal(second.seeded, 0);
  assert.equal(second.skipped_existing, 3);
  assert.equal(doubles.getSheetByName('ClubMembers').getLastRow(), 4); // header + 3
});

test('roster seed only adds members missing from the doubles roster', () => {
  const h = loadCode();
  const singles = buildSingles(h);
  const { doubles, club } = buildDoublesClubMembers(h);

  // Pre-existing doubles member with member_number 7.
  club.appendRow([7, 'Bob', 'bob', '222', '', true, 'x', 'x']);

  const result = h.fn('seedRosterFromSingles')(singles, doubles);

  assert.deepEqual(result.seeded_member_numbers.sort((a, b) => a - b), [3, 12]);
  assert.equal(result.skipped_existing, 1);

  const memberCol = h.bound.CLUB_MEMBER_HEADERS.indexOf('member_number');
  const numbers = club.getDataRange().getValues().slice(1).map((row) => row[memberCol]);
  assert.deepEqual(numbers.sort((a, b) => a - b), [3, 7, 12]);
});

test('roster seed reports a clear error when a ClubMembers tab is missing', () => {
  const h = loadCode();
  const singles = buildSingles(h);
  const doubles = h.makeSpreadsheet('empty-doubles');

  const result = h.fn('seedRosterFromSingles')(singles, doubles);

  assert.equal(result.seeded, 0);
  assert.match(result.error, /ClubMembers tab not found/);
});

test('countRoster reports total and active member counts', () => {
  const h = loadCode();
  const { doubles } = buildDoublesClubMembers(h);
  const singles = buildSingles(h);

  h.fn('seedRosterFromSingles')(singles, doubles);
  const report = h.fn('countRoster')(doubles);

  assert.equal(report.present, true);
  assert.equal(report.count, 3);
  assert.equal(report.active_count, 2);
  assert.deepEqual(report.member_numbers, [3, 7, 12]);
});

test('roster seed copies by header name and never copies current_tag', () => {
  const h = loadCode();
  const singles = buildSingles(h);
  const doubles = h.makeSpreadsheet('doubles-roster');
  const club = doubles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS_DOUBLES);

  const result = h.fn('seedRosterFromSingles')(singles, doubles);
  assert.equal(result.seeded, 3);

  const headers = club.rows[0];
  assert.equal(headers.indexOf('current_tag'), -1);
  assert.equal(headers.indexOf('season_points') !== -1, true);

  const alice = club.rows[1];
  assert.equal(alice[headers.indexOf('member_number')], 3);
  assert.equal(alice[headers.indexOf('name')], 'Alice');
  assert.equal(alice[headers.indexOf('udisc_username')], 'alice');
  assert.equal(alice[headers.indexOf('pdga_number')], '111');
  // A positional copy would shift is_active into the pdga_number slot after
  // current_tag is dropped; the by-name copy lands it correctly.
  assert.equal(alice[headers.indexOf('is_active')], true);
  assert.equal(alice[headers.indexOf('created_at')], 't1');
  assert.equal(alice[headers.indexOf('updated_at')], 't1');
  assert.equal(alice[headers.indexOf('season_points')], '');
});
