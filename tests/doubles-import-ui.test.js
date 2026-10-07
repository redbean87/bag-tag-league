'use strict';

// Structural checks for the doubles split-preview UI in the admin page.
// Behavioural checks (chips, overrides, verdict recompute) run in a real
// browser; see the task's browser-context verification.

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

test('the import screen routes doubles rows to the doubles preview action', () => {
  assert.match(html, /getLeagueFormat\(\) === 'doubles'/);
  assert.match(html, /requestDoublesImportPreview\(rows, leagueDate\)/);

  const actionIndex = html.indexOf("action: 'previewUdiscImportDoubles'");
  assert.notEqual(actionIndex, -1, 'expected the doubles preview action');
  const window = html.slice(actionIndex, actionIndex + 200);
  assert.match(window, /spreadsheetId: getSpreadsheetId\(\)/);
});

test('the split preview renders one chip per partner with its own status', () => {
  assert.match(html, /class="doubles-partner-chip"/);
  assert.match(html, /class="doubles-partner-status"/);
  assert.match(html, /doublesMatchStatusLabel\(match\)/);
  assert.match(html, /class="doubles-partner-override"/);
  assert.match(html, /data-partner="' \+ partner.partner_index/);
});

test('the pair verdict badge is rendered and overrides recompute it', () => {
  assert.match(html, /class="doubles-pair-verdict"/);
  assert.match(html, /function computeDoublesVerdictClient\(entry\)/);
  assert.match(html, /function applyDoublesOverride\(rowIndex, partnerIndex, value\)/);

  const overrideBody = functionBody('applyDoublesOverride');
  assert.match(overrideBody, /computeDoublesVerdictClient\(pair\)/);
  assert.match(overrideBody, /renderDoublesImportPreview\(doublesPreviewData\)/);
});

test('the doubles preview adds a commit affordance that posts raw rows and overrides', () => {
  const render = functionBody('renderDoublesImportPreview');
  assert.match(render, /Preview only\./);
  assert.match(render, /btnCommitDoublesImport/);
  assert.match(render, /commitUdiscImportDoubles\(\)/);

  const request = functionBody('requestDoublesImportPreview');
  assert.doesNotMatch(request, /action: 'commitUdiscImport'/);

  const commit = functionBody('commitUdiscImportDoubles');
  assert.match(commit, /action: 'commitUdiscImportDoubles'/);
  assert.match(commit, /rows: parsedUdiscRows/);
  assert.match(commit, /overrides: overrides/);
  assert.match(commit, /approved: true/);
  // The raw rows plus overrides are posted; no client verdict is authoritative.
  assert.doesNotMatch(commit, /action: 'commitUdiscImport'/);
  assert.doesNotMatch(commit, /verdict:/);
});

test('the commit result renderer surfaces per-pair status and reasons', () => {
  const result = functionBody('renderDoublesCommitResult');
  assert.match(result, /data\.results/);
  assert.match(result, /result\.status/);
  assert.match(result, /result\.reason/);
});

test('malformed pair rows surface their errors and warnings', () => {
  const render = functionBody('renderDoublesImportPreview');
  assert.match(render, /pair\.validation\.errors/);
  assert.match(render, /pair\.validation\.warnings/);
});
