'use strict';

// Doubles UDisc import commit — pair-key derivation, per-pair commit loop,
// per-pair locking, solo branch, explicit outcomes, idempotence, partial
// repair, and failure compensation.
//
// All tests run in a Node VM with an in-memory Sheets fake. No Google
// credentials, network access, or live sheet writes are involved.

const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers/load-code');

const WEEK_DATE = '2026-10-05';
const DOUBLES = '1c8QGftl2bKcLZeqwE2IyzAh5x4I22WRjSSgc7nGgeG8';

function makeWeeklyRow(h, fields) {
  const headers = h.bound.WEEKLY_RECORD_HEADERS_DOUBLES;
  const row = new Array(headers.length).fill('');
  for (const key in fields) {
    const index = headers.indexOf(key);
    if (index !== -1) row[index] = fields[key];
  }
  return row;
}

/**
 * Builds a doubles spreadsheet with the standard test roster and one week tab.
 * `weeklyRows` are raw weekly records appended after the header.
 */
function buildDoubles(h, weeklyRows) {
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);

  const club = doubles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS);
  club.appendRow([3, 'Damon Forsythe', 'damon31', '151236', '', true, '', '']);
  club.appendRow([7, 'Brad Stevenson', 'donjoses', '85170', '', true, '', '']);
  club.appendRow([21, 'Alice Smith', 'alice', '', '', true, '', '']);
  club.appendRow([30, 'Sam Jones', 'samj', '', '', true, '', '']);
  club.appendRow([31, 'Sam Jones', 'samj2', '', '', true, '', '']);
  club.appendRow([40, 'Retired Player', 'retired', '', '', false, '', '']);

  const week = doubles.insertSheet('Week ' + WEEK_DATE);
  week.appendRow(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES);
  (weeklyRows || []).forEach((row) => week.appendRow(row));

  return { doubles, club, week };
}

function commit(h, rows, overrides, extra) {
  const payload = {
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    league_date: WEEK_DATE,
    rows,
    approved: true
  };
  if (overrides !== undefined) payload.overrides = overrides;
  if (extra) Object.assign(payload, extra);
  return h.parse(h.fn('handleCommitUdiscImportDoubles')(payload));
}

function dataRows(sheet) {
  return sheet.rows.slice(1);
}

function column(sheet, header) {
  const index = h_index(sheet, header);
  return dataRows(sheet).map((row) => row[index]);
}

function h_index(sheet, header) {
  return sheet.rows[0].indexOf(header);
}

function rowByMember(sheet, memberNumber) {
  const memberIndex = h_index(sheet, 'member_number');
  return dataRows(sheet).find((row) => row[memberIndex] === memberNumber);
}

const PAIR_ROW = {
  name: 'Damon Forsythe & Brad Stevenson',
  usernames: 'damon31,donjoses',
  position: 1,
  position_raw: 1,
  round_total_score: 41,
  checked_in: 'Yes',
  paid: 'No'
};

// ─── computeDoublesPairKey ───────────────────────────────────────────────────

test('pair key is order-independent and date-scoped', () => {
  const h = loadCode();
  const forward = h.fn('parseDoublesRow')({ name: 'A & B', usernames: 'alpha,bravo' });
  const reverse = h.fn('parseDoublesRow')({ name: 'B & A', usernames: 'bravo,alpha' });

  const keyForward = h.fn('computeDoublesPairKey')(forward, WEEK_DATE);
  const keyReverse = h.fn('computeDoublesPairKey')(reverse, WEEK_DATE);

  assert.equal(keyForward, 'dubs:2026-10-05:u:alpha+u:bravo');
  assert.equal(keyForward, keyReverse);
  assert.notEqual(keyForward, h.fn('computeDoublesPairKey')(forward, '2026-10-12'));
});

test('pair key falls back to normalized display names when usernames are absent', () => {
  const h = loadCode();
  const parsed = h.fn('parseDoublesRow')({ name: 'Ann Smith & Bob Jones' });
  const key = h.fn('computeDoublesPairKey')(parsed, WEEK_DATE);

  assert.equal(key, 'dubs:2026-10-05:n:ann smith+n:bob jones');
});

test('pair key is keyless for solos, duplicate identities, and non-pairs', () => {
  const h = loadCode();

  const solo = h.fn('parseDoublesRow')({ name: 'Robert Finch', username: 'finch411' });
  assert.equal(h.fn('computeDoublesPairKey')(solo, WEEK_DATE), null);

  const collapsed = h.fn('parseDoublesRow')({ name: 'Robert Finch', usernames: 'same,same' });
  assert.equal(collapsed.is_solo, true);
  assert.equal(h.fn('computeDoublesPairKey')(collapsed, WEEK_DATE), null);

  const duplicateTokens = { is_solo: false, partners: [{ username: 'same' }, { username: 'same' }] };
  assert.equal(h.fn('computeDoublesPairKey')(duplicateTokens, WEEK_DATE), null);

  const threePartners = { is_solo: false, partners: [{ username: 'a' }, { username: 'b' }, { username: 'c' }] };
  assert.equal(h.fn('computeDoublesPairKey')(threePartners, WEEK_DATE), null);

  const blankName = { is_solo: false, partners: [{ username: 'a' }, { name: '' }] };
  assert.equal(h.fn('computeDoublesPairKey')(blankName, WEEK_DATE), null);
});

// ─── All-valid doubles ───────────────────────────────────────────────────────

test('commits a pair as two linked weekly rows sharing one pair key', () => {
  const h = loadCode();
  const { week } = buildDoubles(h, []);

  const result = commit(h, [PAIR_ROW]);
  assert.equal(result.status, 'ok');
  assert.equal(result.summary.committed, 1);
  assert.equal(result.results[0].status, 'committed');
  assert.equal(result.results[0].pair_key, 'dubs:2026-10-05:u:damon31+u:donjoses');
  assert.deepEqual(result.created_member_numbers, []);

  const rows = dataRows(week);
  assert.equal(rows.length, 2);
  assert.deepEqual(column(week, 'member_number').sort(), [3, 7]);
  assert.deepEqual(column(week, 'pair_key'), [
    'dubs:2026-10-05:u:damon31+u:donjoses',
    'dubs:2026-10-05:u:damon31+u:donjoses'
  ]);
  assert.deepEqual(column(week, 'partner_member_number').sort(), [3, 7]);
  assert.deepEqual(column(week, 'team_position'), [1, 1]);
  assert.deepEqual(column(week, 'team_position_raw'), [1, 1]);
  assert.deepEqual(column(week, 'weekly_points_status'), ['pending', 'pending']);
  assert.deepEqual(column(week, 'score'), [41, 41]);

  // Identity columns are each partner's own, not the raw pair string.
  assert.deepEqual(column(week, 'udisc_username_import').sort(), ['damon31', 'donjoses']);
  assert.deepEqual(column(week, 'udisc_name_import').sort(), ['Brad Stevenson', 'Damon Forsythe']);
});

test('commits multiple independent pairs with distinct keys', () => {
  const h = loadCode();
  const { week } = buildDoubles(h, []);

  const result = commit(h, [
    PAIR_ROW,
    { name: 'Alice Smith & Sam Jones', usernames: 'alice,samj', position: 2, position_raw: 2 }
  ]);

  assert.equal(result.summary.committed, 2);
  const keys = new Set(column(week, 'pair_key'));
  assert.equal(keys.size, 2);
  assert.equal(dataRows(week).length, 4);
});

// ─── Solos ───────────────────────────────────────────────────────────────────

test('commits a solo as one keyless weekly row with solo points default', () => {
  const h = loadCode();
  const { week } = buildDoubles(h, []);

  const result = commit(h, [{ name: 'Alice Smith', username: 'alice', position: 4, position_raw: 4 }]);
  assert.equal(result.status, 'ok');
  assert.equal(result.summary.solos, 1);
  assert.equal(result.summary.committed, 1);
  assert.equal(result.results[0].is_solo, true);
  assert.equal(result.results[0].pair_key, null);

  const rows = dataRows(week);
  assert.equal(rows.length, 1);
  assert.equal(rows[0][h_index(week, 'pair_key')], '');
  assert.equal(rows[0][h_index(week, 'weekly_points_status')], 'not_applicable');
  assert.equal(rows[0][h_index(week, 'member_number')], 21);
});

test('commits a new solo by creating a member and a keyless weekly row', () => {
  const h = loadCode();
  const { week } = buildDoubles(h, []);

  const result = commit(h, [{ name: 'New Solo', username: 'newsolo', position: 4 }]);
  assert.equal(result.summary.committed, 1);
  assert.equal(result.created_member_numbers.length, 1);
  assert.equal(result.results[0].partners[0].path, 'create');
  assert.equal(dataRows(week)[0][h_index(week, 'pair_key')], '');
});

test('commits a mixed payload of pairs and solos independently', () => {
  const h = loadCode();
  const { week } = buildDoubles(h, []);

  const result = commit(h, [
    PAIR_ROW,
    { name: 'Alice Smith', username: 'alice', position: 4 }
  ]);

  assert.equal(result.summary.pairs, 1);
  assert.equal(result.summary.solos, 1);
  assert.equal(dataRows(week).length, 3);
  assert.equal(column(week, 'pair_key').filter((key) => key === '').length, 1);
});

// ─── Overrides ───────────────────────────────────────────────────────────────

test('a verified override rescues a name-only partner', () => {
  const h = loadCode();
  const { week } = buildDoubles(h, []);

  // No usernames at all: both partners match by name, so there is no
  // blank_handle warning and the override can resolve the unmatched partner.
  const result = commit(
    h,
    [{ name: 'Damon Forsythe & Ghost Person' }],
    { 0: { 1: 21 } }
  );

  assert.equal(result.results[0].status, 'committed');
  assert.equal(rowByMember(week, 21) !== undefined, true);
  assert.equal(rowByMember(week, 21)[h_index(week, 'player_name_snapshot')], 'Alice Smith');
});

test('a valid override does not clear a parse warning (blank handle)', () => {
  const h = loadCode();
  const { week } = buildDoubles(h, []);

  // A blank second handle is a parse warning, so the row stays held for review
  // even though the override itself is valid (warnings gate commit).
  const result = commit(
    h,
    [{ name: 'Damon Forsythe & Ghost Person', usernames: 'damon31,' }],
    { 0: { 1: 21 } }
  );

  assert.equal(result.results[0].status, 'review');
  assert.equal(result.results[0].reason, 'blank_handle');
  assert.equal(dataRows(week).length, 0);
});

test('an override to a non-existent member is rejected', () => {
  const h = loadCode();
  const { week } = buildDoubles(h, []);

  const result = commit(
    h,
    [{ name: 'Damon Forsythe & Ghost Person', usernames: 'damon31,' }],
    { 0: { 1: 999 } }
  );

  assert.equal(result.results[0].status, 'review');
  assert.equal(result.results[0].reason, 'invalid_override');
  assert.equal(dataRows(week).length, 0);
});

test('an override to a member already committed under another pair is a conflict', () => {
  const h = loadCode();
  const { week } = buildDoubles(h, [
    makeWeeklyRow(h, {
      member_number: 21,
      player_name_snapshot: 'Alice Smith',
      udisc_username_snapshot: 'alice',
      pair_key: 'dubs:2026-10-05:u:alice+u:samj'
    })
  ]);

  const result = commit(
    h,
    [{ name: 'Damon Forsythe & Ghost Person', usernames: 'damon31,' }],
    { 0: { 1: 21 } }
  );

  assert.equal(result.results[0].status, 'review');
  assert.equal(result.results[0].reason, 'member_conflict');
  assert.equal(dataRows(week).length, 1);
});

test('an override making both partners the same member is a conflict', () => {
  const h = loadCode();
  const { week } = buildDoubles(h, []);

  const result = commit(h, [PAIR_ROW], { 0: { 0: 21, 1: 21 } });
  assert.equal(result.results[0].status, 'review');
  assert.equal(result.results[0].reason, 'member_conflict');
  assert.equal(dataRows(week).length, 0);
});

// ─── Validation, revalidation, server-side verdict authority ──────────────────

test('a malformed pair row is blocked and writes nothing', () => {
  const h = loadCode();
  const { week, club } = buildDoubles(h, []);

  const result = commit(h, [{ name: 'Damon Forsythe &' }]);
  assert.equal(result.results[0].status, 'blocked');
  assert.ok(result.results[0].reason);
  assert.equal(dataRows(week).length, 0);
  assert.equal(dataRows(club).length, 6);
});

test('a name-only unmatched partner holds the pair for review', () => {
  const h = loadCode();
  const { week } = buildDoubles(h, []);

  const result = commit(h, [{ name: 'Damon Forsythe & Ghost Person', usernames: 'damon31,' }]);
  assert.equal(result.results[0].status, 'review');
  assert.equal(result.results[0].reason, 'unmatched_partner');
  assert.equal(dataRows(week).length, 0);
});

test('an ambiguous partner holds the pair for review', () => {
  const h = loadCode();
  const { week } = buildDoubles(h, [
    makeWeeklyRow(h, { member_number: 30, player_name_snapshot: 'Sam Jones', udisc_username_snapshot: 'samj' }),
    makeWeeklyRow(h, { member_number: 31, player_name_snapshot: 'Sam Jones', udisc_username_snapshot: 'samj2' })
  ]);

  const result = commit(h, [{ name: 'Sam Jones & Alice Smith', usernames: ',alice' }]);
  assert.equal(result.results[0].status, 'review');
  assert.equal(result.results[0].reason, 'ambiguous_match');
  assert.equal(dataRows(week).length, 2);
});

test('a client-supplied verdict cannot bypass server-side recomputation', () => {
  const h = loadCode();
  const { week } = buildDoubles(h, [
    makeWeeklyRow(h, { member_number: 30, player_name_snapshot: 'Sam Jones', udisc_username_snapshot: 'samj' }),
    makeWeeklyRow(h, { member_number: 31, player_name_snapshot: 'Sam Jones', udisc_username_snapshot: 'samj2' })
  ]);

  const result = commit(
    h,
    [{ name: 'Sam Jones & Alice Smith', usernames: ',alice' }],
    undefined,
    {
      verdict: 'ready',
      client_verdict: 'ready',
      verdicts: [{ verdict: 'ready', reason: 'all_partners_resolved' }],
      preview: { verdict: 'ready' },
      matched: true
    }
  );

  assert.equal(result.results[0].status, 'review');
  assert.equal(result.results[0].reason, 'ambiguous_match');
  assert.equal(dataRows(week).length, 2);
});

// ─── Revalidation against member conflicts ───────────────────────────────────

test('a member already committed under a different pair key is a conflict', () => {
  const h = loadCode();
  const { week } = buildDoubles(h, [
    makeWeeklyRow(h, {
      member_number: 3,
      player_name_snapshot: 'Damon Forsythe',
      udisc_username_snapshot: 'damon31',
      pair_key: 'dubs:2026-10-05:u:damon31+u:someone'
    })
  ]);

  const result = commit(h, [PAIR_ROW]);
  assert.equal(result.results[0].status, 'review');
  assert.equal(result.results[0].reason, 'member_conflict');
  assert.equal(dataRows(week).length, 1);
});

test('an existing pair whose identity changed is held for review', () => {
  const h = loadCode();
  const pairKey = 'dubs:2026-10-05:u:damon31+u:donjoses';
  const { week } = buildDoubles(h, [
    makeWeeklyRow(h, {
      member_number: 3,
      player_name_snapshot: 'Damon Forsythe',
      udisc_username_snapshot: 'damon31',
      pair_key: pairKey
    }),
    makeWeeklyRow(h, {
      member_number: 7,
      player_name_snapshot: 'Brad Stevenson',
      udisc_username_snapshot: 'donjoses',
      pair_key: pairKey
    })
  ]);

  // Same key identities, but partner B now resolves to Alice via override.
  const result = commit(h, [PAIR_ROW], { 0: { 1: 21 } });
  assert.equal(result.results[0].status, 'review');
  assert.equal(result.results[0].reason, 'identity_changed');
  assert.equal(dataRows(week).length, 2);
});

// ─── Idempotence and partial repair ──────────────────────────────────────────

test('re-importing the same pair updates in place and never duplicates', () => {
  const h = loadCode();
  const { week } = buildDoubles(h, []);

  const first = commit(h, [PAIR_ROW]);
  assert.equal(first.summary.committed, 1);
  assert.equal(dataRows(week).length, 2);

  const second = commit(h, [PAIR_ROW]);
  assert.equal(second.results[0].status, 'committed');
  assert.equal(dataRows(week).length, 2);
  assert.deepEqual(column(week, 'member_number').sort(), [3, 7]);
});

test('reversed partner order on re-import merges into the same rows', () => {
  const h = loadCode();
  const { week } = buildDoubles(h, []);

  commit(h, [PAIR_ROW]);
  const reversed = commit(h, [{
    name: 'Brad Stevenson & Damon Forsythe',
    usernames: 'donjoses,damon31',
    position: 1,
    position_raw: 1
  }]);

  assert.equal(reversed.results[0].status, 'committed');
  assert.equal(dataRows(week).length, 2);
  assert.equal(reversed.results[0].pair_key, 'dubs:2026-10-05:u:damon31+u:donjoses');
});

test('a partial pair is repaired by committing the missing partner', () => {
  const h = loadCode();
  const pairKey = 'dubs:2026-10-05:u:damon31+u:donjoses';
  const { week } = buildDoubles(h, [
    makeWeeklyRow(h, {
      member_number: 3,
      player_name_snapshot: 'Damon Forsythe',
      udisc_username_snapshot: 'damon31',
      pair_key: pairKey
    })
  ]);

  const result = commit(h, [PAIR_ROW]);
  assert.equal(result.results[0].status, 'repaired');
  assert.equal(result.summary.repaired, 1);
  assert.equal(dataRows(week).length, 2);
  assert.deepEqual(column(week, 'member_number').sort(), [3, 7]);
  assert.equal(column(week, 'pair_key').every((key) => key === pairKey), true);
});

test('the same row twice in one payload commits once and reports the replay', () => {
  const h = loadCode();
  const { week } = buildDoubles(h, []);

  const result = commit(h, [PAIR_ROW, PAIR_ROW]);
  assert.equal(result.summary.committed, 1);
  assert.equal(result.summary.already_committed, 1);
  assert.equal(result.results[0].status, 'committed');
  assert.equal(result.results[1].status, 'already_committed');
  assert.equal(result.results[1].reason, 'idempotent_replay');
  assert.equal(dataRows(week).length, 2);
});

test('two different pairs claiming the same member conflict in one payload', () => {
  const h = loadCode();
  const { week } = buildDoubles(h, []);

  const result = commit(h, [
    { name: 'Damon Forsythe & Alice Smith', usernames: 'damon31,alice', position: 1 },
    { name: 'Sam Jones & Alice Smith', usernames: 'samj,alice', position: 2 }
  ]);

  assert.equal(result.results[0].status, 'committed');
  assert.equal(result.results[1].status, 'review');
  assert.equal(result.results[1].reason, 'member_conflict');
  assert.equal(dataRows(week).length, 2);
});

test('solo re-import of a keyless row updates in place', () => {
  const h = loadCode();
  const { week } = buildDoubles(h, []);

  commit(h, [{ name: 'Alice Smith', username: 'alice', position: 4 }]);
  const second = commit(h, [{ name: 'Alice Smith', username: 'alice', position: 5 }]);

  assert.equal(second.results[0].status, 'committed');
  assert.equal(dataRows(week).length, 1);
  assert.equal(dataRows(week)[0][h_index(week, 'team_position')], 5);
});

test('a solo never collides with a pair row for the same member', () => {
  const h = loadCode();
  const pairKey = 'dubs:2026-10-05:u:damon31+u:donjoses';
  const { week } = buildDoubles(h, [
    makeWeeklyRow(h, {
      member_number: 3,
      player_name_snapshot: 'Damon Forsythe',
      udisc_username_snapshot: 'damon31',
      pair_key: pairKey
    })
  ]);

  const result = commit(h, [{ name: 'Damon Forsythe', username: 'damon31' }]);
  assert.equal(result.results[0].status, 'review');
  assert.equal(result.results[0].reason, 'member_conflict');
  assert.equal(dataRows(week).length, 1);
});

// ─── Locking and phase failures ──────────────────────────────────────────────

test('a lock timeout fails only that pair and the import continues', () => {
  const h = loadCode();
  const { week } = buildDoubles(h, []);

  let calls = 0;
  h.setLockWaitLock(() => {
    calls += 1;
    if (calls === 1) throw new Error('Could not acquire lock');
    return true;
  });

  const result = commit(h, [
    PAIR_ROW,
    { name: 'Alice Smith & Sam Jones', usernames: 'alice,samj', position: 2 }
  ]);

  assert.equal(result.results[0].status, 'failed');
  assert.equal(result.results[0].reason, 'lock_timeout');
  assert.equal(result.results[1].status, 'committed');
  assert.equal(result.summary.failed, 1);
  assert.equal(result.summary.committed, 1);
  assert.equal(dataRows(week).length, 2);
});

test('a member-phase failure is reported and compensated', () => {
  const h = loadCode();
  const { week, club } = buildDoubles(h, []);
  club.appendRow = function () { throw new Error('club append failed'); };

  const result = commit(h, [{ name: 'Brand New & Other New', usernames: 'brandnew,othernew', position: 1 }]);

  assert.equal(result.results[0].status, 'failed');
  assert.equal(result.results[0].reason, 'member_phase_failure');
  assert.equal(dataRows(week).length, 0);
  assert.equal(dataRows(club).length, 6);
});

test('a weekly-phase failure is reported and appended rows are compensated', () => {
  const h = loadCode();
  const { week } = buildDoubles(h, []);

  let appended = 0;
  const originalAppend = week.appendRow.bind(week);
  week.appendRow = function (row) {
    appended += 1;
    if (appended === 2) throw new Error('weekly append failed');
    return originalAppend(row);
  };

  const result = commit(h, [PAIR_ROW]);
  assert.equal(result.results[0].status, 'failed');
  assert.equal(result.results[0].reason, 'weekly_phase_failure');
  assert.equal(dataRows(week).length, 0);
});

// ─── Routing and format gating ───────────────────────────────────────────────

test('the doubles commit is routed from doPost for the doubles action', () => {
  const h = loadCode();
  buildDoubles(h, []);

  const response = h.fn('doPost')({
    postData: {
      contents: JSON.stringify({
        action: 'commitUdiscImportDoubles',
        spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
        league_date: WEEK_DATE,
        rows: [PAIR_ROW],
        approved: true
      })
    }
  });
  const result = JSON.parse(response.getContent());
  assert.equal(result.status, 'ok');
  assert.equal(result.format, 'doubles');
});

test('the doubles commit refuses the singles spreadsheet', () => {
  const h = loadCode();
  h.makeSpreadsheet(h.bound.SPREADSHEET_ID);

  const result = h.parse(h.fn('handleCommitUdiscImportDoubles')({
    spreadsheetId: h.bound.SPREADSHEET_ID,
    league_date: WEEK_DATE,
    rows: [PAIR_ROW],
    approved: true
  }));

  assert.equal(result.status, 'error');
  assert.match(result.message, /doubles spreadsheet/i);
});

test('the singles commit refuses the doubles spreadsheet', () => {
  const h = loadCode();
  buildDoubles(h, []);

  const result = h.parse(h.fn('handleCommitUdiscImport')({
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    league_date: WEEK_DATE,
    rows: [{ name: 'Someone', username: 'someone' }],
    approved: true
  }));

  assert.equal(result.status, 'error');
  assert.match(result.message, /doubles/i);
});

test('the doubles commit requires approval and a valid date', () => {
  const h = loadCode();
  buildDoubles(h, []);

  const unapproved = h.parse(h.fn('handleCommitUdiscImportDoubles')({
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    league_date: WEEK_DATE,
    rows: [PAIR_ROW]
  }));
  assert.equal(unapproved.status, 'error');

  const badDate = h.parse(h.fn('handleCommitUdiscImportDoubles')({
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    league_date: 'nope',
    rows: [PAIR_ROW],
    approved: true
  }));
  assert.equal(badDate.status, 'error');
});

// ─── Protected-field preservation ────────────────────────────────────────────

test('re-import preserves protected weekly fields', () => {
  const h = loadCode();
  const pairKey = 'dubs:2026-10-05:u:damon31+u:donjoses';
  const { week } = buildDoubles(h, [
    makeWeeklyRow(h, {
      member_number: 3,
      player_name_snapshot: 'Damon Forsythe',
      udisc_username_snapshot: 'damon31',
      pair_key: pairKey,
      in_tag: 12,
      out_tag: 9,
      checked_in: true,
      signed_in_at: '2026-10-05T18:00:00Z',
      paid: true,
      ctp: true,
      ace_pot: true,
      notes: 'keep me'
    })
  ]);

  const result = commit(h, [PAIR_ROW]);
  assert.equal(result.results[0].status, 'repaired');

  const row = rowByMember(week, 3);
  assert.equal(row[h_index(week, 'in_tag')], 12);
  assert.equal(row[h_index(week, 'out_tag')], 9);
  assert.equal(row[h_index(week, 'checked_in')], true);
  assert.equal(row[h_index(week, 'signed_in_at')], '2026-10-05T18:00:00Z');
  assert.equal(row[h_index(week, 'paid')], true);
  assert.equal(row[h_index(week, 'ctp')], true);
  assert.equal(row[h_index(week, 'ace_pot')], true);
  assert.equal(row[h_index(week, 'notes')], 'keep me');
  assert.equal(row[h_index(week, 'updated_at')] !== '', true);
});
