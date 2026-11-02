'use strict';

// Structural checks for the tie-winner controls and Finalize Week button in
// the doubles results panel. Behaviour was verified in a real browser.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT } = require('./helpers/load-code');

const html = fs.readFileSync(path.join(REPO_ROOT, 'src', 'admin', 'index.html'), 'utf8');

function functionBody(name) {
  const start = html.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'expected function ' + name);
  const next = html.indexOf('\n    async function ', start + 1);
  const nextSync = html.indexOf('\n    function ', start + 1);
  const ends = [next, nextSync].filter((i) => i !== -1);
  return html.slice(start, ends.length ? Math.min(...ends) : undefined);
}

test('the results panel renders the tie section from the server tie view', () => {
  assert.match(functionBody('renderPointsResults'), /renderTieSection\(data\.ties\)/);
  const section = functionBody('renderTieSection');
  assert.match(section, /type="radio"/);
  assert.match(section, /saveTieWinner\(/);
  assert.match(section, /id="btnFinalizeWeek"/);
});

test('the tie actions post to the tie endpoints and never touch tag actions', () => {
  assert.match(html, /postTieAction\('saveTieBreaks'/);
  assert.match(html, /postTieAction\('finalizeDoublesWeek'/);
  for (const name of ['renderTieSection', 'postTieAction', 'saveTieWinner', 'clearTieWinners', 'finalizeDoublesWeek']) {
    const body = functionBody(name);
    assert.doesNotMatch(body, /calculateTags|confirmTags|finalizeRound|out_tag|in_tag|current_tag/);
  }
});
