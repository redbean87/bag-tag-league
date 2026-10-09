'use strict';

// Structural checks for the doubles Members season-total surface in the admin
// page and the player sign-in member listing. Behavioural checks run in a real
// browser; see the task's browser-context verification.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT } = require('./helpers/load-code');

const adminHtml = fs.readFileSync(path.join(REPO_ROOT, 'src', 'admin', 'index.html'), 'utf8');
const playerHtml = fs.readFileSync(path.join(REPO_ROOT, 'src', 'player', 'sign-in', 'index.html'), 'utf8');

function functionBody(html, name) {
  const start = html.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'expected function ' + name);
  const next = html.indexOf('\n    function ', start + 1);
  return html.slice(start, next === -1 ? undefined : next);
}

test('the Members panel is present and labelled Season Total', () => {
  assert.match(adminHtml, /id="membersCard"/);
  assert.match(adminHtml, /id="membersTable"/);
  assert.match(adminHtml, /id="btnLoadMembers" onclick="loadMembers\(\)"/);
  assert.match(adminHtml, />Season Total</);
});

test('the Members panel is a collapsed accordion with mobile touch targets', () => {
  // Rendered as the shared details.card accordion and collapsed by default.
  assert.match(adminHtml, /<details class="card" id="membersCard" style="display:none;">\n    <summary>/);
  assert.doesNotMatch(adminHtml, /<details[^>]*id="membersCard"[^>]*\bopen\b/);
  assert.match(adminHtml, /<summary>[\s\S]*?<h2>Members<\/h2>[\s\S]*?<\/summary>\s*<div class="card-body">/);

  // The phone layout gives the summary and Refresh action touch-target
  // height and lets the wide table scroll instead of overflowing.
  assert.match(adminHtml, /details#membersCard > summary \{\s*min-height: 48px;/);
  assert.match(adminHtml, /#membersTable \{\s*overflow-x: auto;/);
  assert.match(adminHtml, /#membersCard button \{\s*min-height: 44px;/);
});

test('the Members panel is doubles-only and posts to listClubMembers', () => {
  const apply = functionBody(adminHtml, 'applyLeague');
  assert.match(apply, /membersCard\.style\.display = rules\.usesPoints \? '' : 'none'/);

  const load = functionBody(adminHtml, 'loadMembers');
  assert.match(load, /action: 'listClubMembers'/);
  assert.match(load, /spreadsheetId: getSpreadsheetId\(\)/);
});

test('the members table defaults a missing season_points to 0', () => {
  const render = functionBody(adminHtml, 'renderMembers');
  assert.match(render, /Season Total/);
  assert.match(render, /member\.season_points === undefined/);
  assert.match(render, /isNaN\(member\.season_points\)/);
  assert.match(render, /\? 0/);
});

test('committing a doubles import refreshes the members listing', () => {
  const commit = functionBody(adminHtml, 'commitUdiscImportDoubles');
  assert.match(commit, /loadMembers\(\)/);
});

test('the player sign-in listing shows the doubles season total only', () => {
  const render = functionBody(playerHtml, 'renderSearchResults');
  assert.match(render, /Season Total: /);
  assert.match(render, /if \(rules\.usesPoints\)/);
  // The tag-scoring tag detail line is untouched.
  assert.match(render, /rules\.usesTags && member\.current_tag/);
});
