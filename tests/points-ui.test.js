'use strict';

// Structural checks for the read-only doubles Points Results panel in the
// admin page. Behavioural checks (card visibility, button wiring, rendering)
// run in a real browser; see the task's browser-context verification.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT } = require('./helpers/load-code');

const html = fs.readFileSync(path.join(REPO_ROOT, 'src', 'admin', 'index.html'), 'utf8');

function functionBody(name) {
  const start = html.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'expected function ' + name);
  const next = html.indexOf('\n    function ', start + 1);
  return html.slice(start, next === -1 ? undefined : next);
}

test('the points results panel is present and doubles-only', () => {
  assert.match(html, /id="pointsCalcCard"/);
  assert.match(html, /id="btnLoadPoints" onclick="loadPoints\(\)"/);

  const apply = functionBody('applyLeague');
  assert.match(apply, /pointsCard\.style\.display = rules\.usesPoints \? '' : 'none'/);
});

test('the retired lifecycle controls are gone from the panel', () => {
  for (const id of ['btnPreviewPoints', 'btnConfirmPoints', 'btnFinalizePoints', 'btnUnlockPoints']) {
    assert.doesNotMatch(html, new RegExp('id="' + id + '"'), id + ' must not exist');
  }
  for (const name of ['confirmPoints', 'finalizePoints', 'unlockPoints', 'rekeyPointsPair', 'voidPointsPair', 'updatePointsControls']) {
    assert.equal(html.indexOf('function ' + name + '('), -1, name + ' must not exist');
  }
});

test('the points panel reads results from the format-gated server action', () => {
  assert.match(functionBody('fetchPointsResults'), /action: 'calculatePoints'/);
  assert.match(functionBody('fetchPointsResults'), /spreadsheetId: getSpreadsheetId\(\)/);
  assert.match(functionBody('loadPoints'), /fetchPointsResults\(\)/);
});

test('the results view renders committed points, warnings, and no lifecycle state', () => {
  const render = functionBody('renderPointsResults');
  assert.match(render, /Read-only\. Points are computed from each committed placement at import commit\./);
  assert.match(render, /data\.warnings/);
  assert.match(render, /data\.players/);
  assert.match(render, /pair\.members/);
  assert.doesNotMatch(render, /pointsStatusLabel|week_state|stored_status|voided/);
});

test('the week table is labelled Week Results and keeps its contents', () => {
  const render = functionBody('renderPointsResults');
  // The table heading is Week Results; its columns and data wiring are
  // unchanged (Pair / Place / Points, plus Payout when the league pays).
  assert.match(render, />Week Results<\/h3>/);
  assert.match(render, />Pair<\/th>/);
  assert.match(render, />Place<\/th>/);
  assert.match(render, />Points<\/th>/);
  assert.match(render, />Payout<\/th>/);
  assert.match(render, /result\.payout_total/);
  assert.match(render, /result\.points/);
  assert.match(render, /escHtml\(result\.label\)/);
});

test('the points card renders a Season Standings table below the week results', () => {
  // The standings container sits inside the Points Results card, after the
  // week results container, and is never the Members view.
  assert.match(html, /id="pointsPreview"[\s\S]*?id="seasonStandings"[\s\S]*?id="pointsResult"/);

  const render = functionBody('renderSeasonStandings');
  assert.match(render, />Season Standings<\/h3>/);
  assert.match(render, />Member<\/th>/);
  assert.match(render, />Season Points<\/th>/);
  assert.match(render, />Earned<\/th>/);
  // Member names are escaped; points are bold like the results table.
  assert.match(render, /escHtml\(row\.name\)/);
  assert.match(render, /font-weight:bold/);
  // Earnings render as $X.XX and default to 0 rather than NaN.
  assert.match(render, /row\.season_earnings \|\| 0/);
  assert.match(render, /toFixed\(2\)/);
  // An empty season renders a friendly empty state, not an empty table.
  assert.match(render, /No members with season points yet\./);
});

test('the standings load with the points panel and refresh after a commit', () => {
  const fetch = functionBody('fetchSeasonStandings');
  assert.match(fetch, /action: 'seasonStandings'/);
  assert.match(fetch, /spreadsheetId: getSpreadsheetId\(\)/);

  const refresh = functionBody('refreshPointsPanel');
  assert.match(refresh, /loadSeasonStandings\(\)/);

  const load = functionBody('loadPoints');
  assert.match(load, /loadSeasonStandings\(\)/);

  // A commit refreshes the points panel, which refreshes the standings.
  const commit = functionBody('commitUdiscImportDoubles');
  assert.match(commit, /refreshPointsPanel\(\)/);
});

test('switching date or league clears the standings with the week results', () => {
  const clear = functionBody('clearStaleSectionData');
  assert.match(clear, /seasonStandings/);
});

test('the results view renders the weekly pool and a note when second place is unpaid', () => {
  const render = functionBody('renderPointsResults');
  assert.match(render, /payout\.pool/);
  assert.match(render, /payout\.second_paid/);
  assert.match(render, /Second place is not paid:/);
  assert.match(render, /payout\.winners_total/);
  assert.match(render, /payout\.second_min_players/);
});

test('the points panel resets when the active date or league changes', () => {
  const clear = functionBody('clearStaleSectionData');
  assert.match(clear, /pointsPreview/);
  assert.match(clear, /clearPointsStatus\(\)/);
});

test('committing a doubles import refreshes the results view and member totals', () => {
  const commit = functionBody('commitUdiscImportDoubles');
  assert.match(commit, /refreshPointsPanel\(\)/);
  assert.match(commit, /loadMembers\(\)/);
});

test('the points panel never references tag actions or tag fields', () => {
  for (const name of ['loadPoints', 'refreshPointsPanel', 'renderPointsResults']) {
    const body = functionBody(name);
    assert.doesNotMatch(body, /calculateTags|confirmTags|finalizeRound/);
    assert.doesNotMatch(body, /out_tag|current_tag/);
  }
});
