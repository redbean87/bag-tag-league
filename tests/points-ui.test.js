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

// Minimal escaping stub for executing renderSeasonStandings in isolation.
const escHtmlForTest = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

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
  // Place sits immediately after Member, mirroring Week Results' layout.
  assert.match(render, />Member<\/th>[\s\S]*?>Place<\/th>/);
  assert.match(render, />Place<\/th>[\s\S]*?>Season Points<\/th>/);
  assert.match(render, />Season Points<\/th>/);
  assert.match(render, />Earned<\/th>/);
  // Member names are escaped and never followed by the (#N) member number.
  assert.match(render, /escHtml\(row\.name\)/);
  assert.doesNotMatch(render, /\(#/);
  assert.doesNotMatch(render, /member_number/);
  // A checkbox by the table toggles the Earned column.
  assert.match(render, /type="checkbox"/);
  assert.match(render, /onchange="toggleSeasonStandingsEarned\(this\.checked\)"/);
  assert.match(render, /toggleSeasonStandingsEarned/);
  assert.match(render, /font-weight:bold/);
  // Earnings render as $X.XX and default to 0 rather than NaN.
  assert.match(render, /row\.season_earnings \|\| 0/);
  assert.match(render, /toFixed\(2\)/);
  // An empty season renders a friendly empty state, not an empty table.
  assert.match(render, /No members with season points yet\./);

  // Derived places: run the real render over both ranking scenarios so
  // sequential row numbering (1,2,3,4,5) and distinct-score counting
  // (1,2,2,3,4) both fail.
  const renderStandings = new Function(
    'document',
    'escHtml',
    'seasonStandingsShowEarned',
    'seasonStandingsLastData',
    render + '\nreturn renderSeasonStandings;'
  );
  const run = (standings, showEarned = true) => {
    const el = { innerHTML: '', style: {} };
    renderStandings({ getElementById: () => el }, escHtmlForTest, showEarned, null)({ standings });
    return el.innerHTML;
  };
  const placesFrom = (tableHtml) => {
    const places = [];
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let rowMatch;
    while ((rowMatch = rowRe.exec(tableHtml)) !== null) {
      const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
      const cells = [];
      let cellMatch;
      while ((cellMatch = cellRe.exec(rowMatch[1])) !== null) cells.push(cellMatch[1]);
      if (!cells.length) continue; // header row uses <th>
      places.push(parseInt(cells[1].replace(/<[^>]*>/g, ''), 10));
    }
    return places;
  };
  const member = (name, n, pts) => ({ name, member_number: n, season_points: pts, season_earnings: 0 });

  // Tied scores share a place and the next rank skips: 1, 2, 2, 4, 5.
  assert.deepEqual(placesFrom(run([
    member('A', 1, 2),
    member('B', 2, 1.5),
    member('C', 3, 1.5),
    member('D', 4, 1),
    member('E', 5, 0.5),
  ])), [1, 2, 2, 4, 5]);
  // No ties: plain 1, 2, 3, 4.
  assert.deepEqual(placesFrom(run([
    member('A', 1, 2),
    member('B', 2, 1.5),
    member('C', 3, 1),
    member('D', 4, 0.5),
  ])), [1, 2, 3, 4]);
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

test('the Season Earned column toggle hides and shows header and cells', () => {
  const render = functionBody('renderSeasonStandings');
  const toggle = functionBody('toggleSeasonStandingsEarned');

  const renderStandings = new Function(
    'document',
    'escHtml',
    'seasonStandingsShowEarned',
    'seasonStandingsLastData',
    render + '\nreturn renderSeasonStandings;'
  );
  const run = (standings, showEarned) => {
    const el = { innerHTML: '', style: {} };
    renderStandings({ getElementById: () => el }, escHtmlForTest, showEarned, null)({ standings });
    return el.innerHTML;
  };
  const standings = [
    { name: 'Ada', member_number: 7, season_points: 3, season_earnings: 12.5 },
    { name: 'Bo', member_number: 8, season_points: 1, season_earnings: 0 },
  ];

  // Default (shown): the Earned header and both dollar cells are present,
  // and the checkbox renders checked. The member number never renders.
  const shown = run(standings, true);
  assert.match(shown, />Earned<\/th>/);
  assert.match(shown, />\$12\.50<\/td>/);
  assert.match(shown, />\$0\.00<\/td>/);
  assert.match(shown, /type="checkbox" checked/);
  assert.doesNotMatch(shown, /\(#/);

  // Hidden: the header, the cells, and the checked state are all gone while
  // the Member, Place, and Season Points columns stay.
  const hidden = run(standings, false);
  assert.doesNotMatch(hidden, />Earned<\/th>/);
  assert.doesNotMatch(hidden, /\$12\.50/);
  assert.doesNotMatch(hidden, />\$0\.00</);
  assert.doesNotMatch(hidden, /type="checkbox" checked/);
  assert.match(hidden, />Member<\/th>/);
  assert.match(hidden, />Place<\/th>/);
  assert.match(hidden, />Season Points<\/th>/);
  assert.match(hidden, />Ada<\/td>/);

  // The toggle handler records the choice, remembers it, and re-renders
  // from the last payload so the change is visible immediately.
  assert.match(toggle, /seasonStandingsShowEarned = !!show/);
  assert.match(toggle, /localStorage\.setItem\('seasonStandingsShowEarned'/);
  assert.match(toggle, /renderSeasonStandings\(seasonStandingsLastData\)/);

  // A fresh browser defaults to shown: only a stored '0' hides the column.
  assert.match(html, /getItem\('seasonStandingsShowEarned'\) !== '0'/);
});

test('the Season Earned toggle renders as a compact one-line checkbox on narrow screens', () => {
  // The global input rule stretches every field to full width with padding
  // and a bottom margin; on an iPhone SE that wraps the toggle into a
  // full-width checkbox with the caption on its own line. The toggle opts
  // out with a scoped class instead of changing the shared rule.
  const render = functionBody('renderSeasonStandings');
  assert.match(render, /<label class="earned-toggle">/);
  assert.doesNotMatch(render, /label class="earned-toggle"[\s\S]*?display:block/);

  // The class exists in the page stylesheet and overrides the global sizing
  // for both the label and its checkbox.
  assert.match(html, /<style>[^<]*label\.earned-toggle[^]*?<\/style>/);
  assert.match(html, /label\.earned-toggle \{[^}]*display:\s*flex[^}]*align-items:\s*center[^}]*\}/);
  assert.match(html, /label\.earned-toggle input\[type="checkbox"\] \{[^}]*width:\s*auto[^}]*padding:\s*0[^}]*margin:\s*0[^}]*\}/);

  // With the global input rule in force, these overrides are what keep the
  // checkbox and its caption on one aligned line at 375px and 320px.
  assert.match(html, /input,\s*select \{[^}]*width:\s*100%/);
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
