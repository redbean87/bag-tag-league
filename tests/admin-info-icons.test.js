'use strict';

// Structural checks for the admin card info icons. The descriptive text for
// every admin card lives in a hidden panel behind a real info button at the
// right of the header, so headers stay scannable and no help string is lost.
// Behavioural checks (tap/click toggling, phone viewport) run in a real
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

function infoButtons() {
  return html.match(/<button[^>]*class="info-toggle"[^>]*>/g) || [];
}

function infoPanels() {
  const panels = [];
  const re = /<div class="card-info" id="([^"]+)"[^>]*>([\s\S]*?)<\/div>/g;
  let match;
  while ((match = re.exec(html))) {
    panels.push({ id: match[1], body: match[2], full: match[0] });
  }
  return panels;
}

// The descriptive strings that used to sit inline on the cards. Each must
// survive verbatim, and only behind an info icon.
const DESCRIPTIVE_STRINGS = [
  'Choose which league you are managing.',
  'the first league remains the default.',
  'Configure league settings',
  'Format and scoring are set when a league is provisioned',
  'Doubles season totals',
  'Doubles members with their <strong>Season Total</strong>',
  'Select a date to work with. Dates with existing sheets will unlock the workflow.',
  'Create a new tab in the spreadsheet for the Active League Date.',
  '<code>Week YYYY-MM-DD</code> with the standard 48-column roster template.',
  'Display a QR code that players can scan to open the sign-in page on their phone.',
  'Review participating players and calculate ace pot and CTP totals.',
  'Upload a UDisc <code>Event results</code> xlsx export',
  'Calculate tag assignments for all players in a weekly league.',
  'Propagate <code>out_tag</code> values from the weekly sheet',
  'Doubles weekly points: 1st=2, 2nd=1.5, 3rd=1',
  'Create the League (with <code>league_format=doubles</code>)',
  'Clear test data from the doubles test spreadsheet.'
];

test('every admin card carries an info button that controls its own panel', () => {
  const buttons = infoButtons();
  const panels = infoPanels();

  assert.ok(buttons.length >= 13, 'expected the cards to carry info buttons');
  assert.equal(buttons.length, panels.length, 'each info button owns one panel');

  const controls = buttons.map((tag) => {
    const match = tag.match(/aria-controls="([^"]+)"/);
    assert.ok(match, 'info button must point at its panel: ' + tag);
    return match[1];
  });
  const panelIds = panels.map((panel) => panel.id);

  // One button per panel, and every control resolves to a real panel.
  assert.deepEqual(controls.slice().sort(), panelIds.slice().sort());
  assert.equal(new Set(controls).size, controls.length, 'no control is reused');
});

test('the info buttons are real, labelled, non-hover controls', () => {
  for (const tag of infoButtons()) {
    assert.match(tag, /type="button"/);
    assert.match(tag, /aria-expanded="false"/);
    assert.match(tag, /onclick="toggleCardInfo\(event, '[^']+'\)"/);
    // A hover-only tooltip (title attribute) is not an accessible control.
    assert.doesNotMatch(tag, /\btitle=/);
    const label = tag.match(/aria-label="([^"]+)"/);
    assert.ok(label && label[1].trim().length > 0, 'info button needs an aria-label: ' + tag);
  }
});

test('every descriptive string moved verbatim into an info panel', () => {
  const panels = infoPanels();
  const panelText = panels.map((panel) => panel.body).join('\n');
  const visible = panels.reduce((remaining, panel) => remaining.replace(panel.full, ''), html);

  for (const text of DESCRIPTIVE_STRINGS) {
    assert.ok(panelText.includes(text), 'expected panel text to keep: ' + text);
    assert.ok(!visible.includes(text), 'expected string to leave the visible card: ' + text);
  }
});

test('the summary hints were folded into the info panels', () => {
  assert.doesNotMatch(html, /class="summary-hint"/);
  const panelText = infoPanels().map((panel) => panel.body).join('\n');
  assert.ok(panelText.includes('Configure league settings'));
  assert.ok(panelText.includes('Doubles season totals'));
});

test('toggling opens one panel, marks it expanded, and Escape closes it', () => {
  const toggle = functionBody('toggleCardInfo');
  assert.match(toggle, /event\.preventDefault\(\)/);
  assert.match(toggle, /closeCardInfo\(\)/);
  assert.match(toggle, /panel\.hidden = false/);
  assert.match(toggle, /setAttribute\('aria-expanded', 'true'\)/);
  // A panel inside a collapsed accordion forces the card open.
  assert.match(toggle, /button\.closest\('details'\)/);
  assert.match(toggle, /details\.open = true/);

  const close = functionBody('closeCardInfo');
  assert.match(close, /panels\[i\]\.hidden = true/);
  assert.match(close, /setAttribute\('aria-expanded', 'false'\)/);

  assert.match(html, /addEventListener\('keydown'[\s\S]*?Escape[\s\S]*?closeCardInfo\(\)/);
});

test('the info icon is a phone-sized touch target', () => {
  const rule = html.match(/\.info-toggle \{([\s\S]*?)\}/);
  assert.ok(rule, 'expected the info-toggle rule');
  assert.match(rule[1], /min-width: 44px/);
  assert.match(rule[1], /min-height: 44px/);
  const shared = html.match(/<div class="card-info" id="[^"]+"[^>]*>/g) || [];
  assert.ok(shared.length >= 13, 'every panel shares the card-info treatment');
});
