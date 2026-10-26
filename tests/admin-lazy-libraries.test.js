'use strict';

// Deferred optional libraries: SheetJS and qrcode load only when the import
// parser or the QR modal first needs them. The initial admin page must not
// download either bundle, and concurrent or repeated feature use must share a
// single in-flight load instead of injecting duplicate script tags.
//
// The loader functions are evaluated in a VM with a fake document, so no
// browser, network, or live data is involved.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { REPO_ROOT } = require('./helpers/load-code');

const adminHtml = fs.readFileSync(path.join(REPO_ROOT, 'src', 'admin', 'index.html'), 'utf8');

function functionBody(html, name) {
  const start = html.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'expected function ' + name);
  const next = html.indexOf('\n    function ', start + 1);
  return html.slice(start, next === -1 ? undefined : next);
}

function headScripts() {
  const head = adminHtml.slice(0, adminHtml.indexOf('</head>'));
  return Array.from(head.matchAll(/<script src="([^"]+)"><\/script>/g)).map((match) => match[1]);
}

/** Loads the deferred-library block into a fake window/document. */
function loadLoaderBlock() {
  const start = adminHtml.indexOf('    var XLSX_URL =');
  assert.notEqual(start, -1, 'expected the deferred library block');
  const endMarker = '    var cachedWeeklyTabs = [];';
  const end = adminHtml.indexOf(endMarker, start);
  assert.notEqual(end, -1, 'expected the deferred library block to end before cachedWeeklyTabs');
  const source = adminHtml.slice(start, end);

  const appended = [];
  const window = {};
  const document = {
    head: {
      appendChild(script) {
        appended.push(script);
        return script;
      }
    },
    createElement(tag) {
      return { tagName: tag, src: '', async: false };
    }
  };

  const sandbox = { window, document, Promise, Error };
  vm.createContext(sandbox);
  const exported = vm.runInContext(
    source + '\n;({ loadScriptOnce: loadScriptOnce, ensureXLSX: ensureXLSX, ensureQRCode: ensureQRCode })',
    sandbox
  );

  return { exported, window, appended };
}

// ─── Initial page load pays nothing for the optional libraries ────────────

test('the admin head no longer loads SheetJS or qrcode', () => {
  const scripts = headScripts();
  assert.equal(
    scripts.some((url) => /xlsx/i.test(url)),
    false,
    'SheetJS must not be a head script'
  );
  assert.equal(
    scripts.some((url) => /qrcode/i.test(url)),
    false,
    'qrcode must not be a head script'
  );
});

test('the shared league-format script still loads during boot', () => {
  assert.ok(
    headScripts().some((url) => /league-format\.js$/.test(url)),
    'league-format.js stays a classic head script so its globals exist before app code'
  );
});

// ─── Every consumer waits for its library ────────────────────────────────

test('the import parser awaits SheetJS before using it', () => {
  const preview = functionBody(adminHtml, 'previewUdiscImport');
  const ensureAt = preview.indexOf('await ensureXLSX()');
  const readAt = preview.indexOf('XLSX.read(');

  assert.notEqual(ensureAt, -1, 'the import flow must await the SheetJS loader');
  assert.notEqual(readAt, -1);
  assert.ok(ensureAt < readAt, 'SheetJS must load before XLSX.read runs');
  assert.match(preview, /Could not load the spreadsheet parser/);
});

test('the QR modal awaits qrcode before building the code', () => {
  const show = functionBody(adminHtml, 'showSignInQR');
  const ensureAt = show.indexOf('await ensureQRCode()');
  const useAt = show.indexOf('new QRCode(');

  assert.notEqual(ensureAt, -1, 'the QR flow must await the qrcode loader');
  assert.notEqual(useAt, -1);
  assert.ok(ensureAt < useAt, 'qrcode must load before the modal builds a code');
  assert.match(show, /Could not load the QR code library/);
});

test('no other code touches the optional library globals', () => {
  const xlsxUses = Array.from(adminHtml.matchAll(/XLSX\./g)).map((match) => match.index);
  const qrUses = Array.from(adminHtml.matchAll(/\bnew QRCode\(|QRCode\.CorrectLevel/g))
    .map((match) => match.index);

  // Only the import parser and the QR builder consume them, both after an
  // awaited loader.
  assert.ok(xlsxUses.every((index) => index > adminHtml.indexOf('function previewUdiscImport(')));
  assert.ok(qrUses.every((index) => index > adminHtml.indexOf('function showSignInQR(')));
});

// ─── Loader behaviour ────────────────────────────────────────────────────

test('a repeated or concurrent request shares one in-flight script', async () => {
  const { exported, window, appended } = loadLoaderBlock();

  const first = exported.ensureXLSX();
  const second = exported.ensureXLSX();

  assert.equal(appended.length, 1, 'concurrent requests inject one script tag');
  assert.match(appended[0].src, /xlsx/);

  window.XLSX = { read() {} };
  appended[0].onload();

  const [a, b] = await Promise.all([first, second]);
  assert.equal(a, window.XLSX, 'the loader resolves with the library global');
  assert.equal(b, window.XLSX);

  // After a successful load, later calls do not inject a second script.
  assert.equal(await exported.ensureXLSX(), window.XLSX);
  assert.equal(appended.length, 1);
});

test('the two libraries load independently', async () => {
  const { exported, window, appended } = loadLoaderBlock();

  const qr = exported.ensureQRCode();
  assert.equal(appended.length, 1);
  assert.match(appended[0].src, /qrcode/);

  window.QRCode = function QRCode() {};
  appended[0].onload();
  assert.equal(await qr, window.QRCode);

  const xlsx = exported.ensureXLSX();
  assert.equal(appended.length, 2);
  assert.match(appended[1].src, /xlsx/);
  xlsx.catch(() => {});
});

test('a failed load rejects with an actionable error and can be retried', async () => {
  const { exported, window, appended } = loadLoaderBlock();

  const failed = exported.ensureXLSX();
  appended[0].onerror();
  await assert.rejects(failed, /Could not load/);

  // The failed attempt is forgotten, so a retry injects a fresh script.
  const retry = exported.ensureXLSX();
  assert.equal(appended.length, 2);

  window.XLSX = { read() {} };
  appended[1].onload();
  assert.equal(await retry, window.XLSX);
});

test('a script that loads without initializing its global rejects', async () => {
  const { exported, appended } = loadLoaderBlock();

  const pending = exported.ensureQRCode();
  appended[0].onload(); // no window.QRCode set

  await assert.rejects(pending, /QRCode did not initialize/);
});

test('the loaders never add a head script before first use', () => {
  const { appended } = loadLoaderBlock();
  assert.deepEqual(appended, []);
});
