'use strict';

// Per-league checked-in image on the player sign-in page. Each league's image
// lives at `src/player/sign-in/league-images/<league id>.<ext>`, and the page
// tries the accepted extensions in order. When no file exists the image stays
// hidden and the league-name text remains, exactly as the text-only header
// worked before. The resolver is pure and takes an injectable loader, so the
// fallback sequence is exercised without a browser.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const LeagueImage = require('../src/player/sign-in/league-image');
const { REPO_ROOT } = require('./helpers/load-code');

const SIGN_IN_HTML = fs.readFileSync(
  path.join(REPO_ROOT, 'src', 'player', 'sign-in', 'index.html'),
  'utf8'
);

// Minimal stand-in for the image element's surface used by mountLeagueImage.
function fakeImage() {
  const classes = new Set(['league-image', 'hidden']);
  const attributes = {};
  return {
    attributes,
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); }
    },
    setAttribute(name, value) { attributes[name] = value; },
    removeAttribute(name) { delete attributes[name]; },
    hasClass(name) { return classes.has(name); }
  };
}

// Loader that reports the given candidate URLs as present; every other
// candidate is a miss. Records the attempts in order.
function loaderFor(presentUrls, attempts) {
  return function (url, onResult) {
    attempts.push(url);
    onResult(presentUrls.indexOf(url) !== -1);
  };
}

test('the image URL is built from the league id under league-images', () => {
  assert.equal(
    LeagueImage.imageUrl('nightfliers-random-dubs', 'png'),
    'league-images/nightfliers-random-dubs.png'
  );
  assert.equal(
    LeagueImage.imageUrl('b-rads-league', 'webp'),
    'league-images/b-rads-league.webp'
  );
});

test('the candidates are the accepted extensions tried in order', () => {
  assert.deepEqual(LeagueImage.IMAGE_EXTENSIONS, ['png', 'jpg', 'jpeg', 'webp']);
  assert.deepEqual(LeagueImage.candidateImageUrls('nightfliers-random-dubs'), [
    'league-images/nightfliers-random-dubs.png',
    'league-images/nightfliers-random-dubs.jpg',
    'league-images/nightfliers-random-dubs.jpeg',
    'league-images/nightfliers-random-dubs.webp'
  ]);
});

test('the first candidate that loads wins and later ones are never tried', () => {
  const attempts = [];
  let resolved;
  LeagueImage.resolveLeagueImage(
    'b-rads-league',
    loaderFor(['league-images/b-rads-league.png'], attempts),
    (url) => { resolved = url; }
  );

  assert.equal(resolved, 'league-images/b-rads-league.png');
  assert.deepEqual(attempts, ['league-images/b-rads-league.png']);
});

test('a miss advances through the extensions until one loads', () => {
  const attempts = [];
  let resolved;
  const jpeg = 'league-images/nightfliers-random-dubs-test.jpeg';
  LeagueImage.resolveLeagueImage(
    'nightfliers-random-dubs-test',
    loaderFor([jpeg], attempts),
    (url) => { resolved = url; }
  );

  assert.equal(resolved, jpeg);
  // png and jpg missed before jpeg loaded; webp was never reached.
  assert.deepEqual(attempts, [
    'league-images/nightfliers-random-dubs-test.png',
    'league-images/nightfliers-random-dubs-test.jpg',
    jpeg
  ]);
});

test('no image file resolves to null after every extension is tried', () => {
  const attempts = [];
  let resolved = 'unset';
  LeagueImage.resolveLeagueImage(
    'nightfliers-random-dubs',
    loaderFor([], attempts),
    (url) => { resolved = url; }
  );

  assert.equal(resolved, null);
  assert.deepEqual(attempts, LeagueImage.candidateImageUrls('nightfliers-random-dubs'));
});

test('a league with no usable image file keeps the text-only header', () => {
  const img = fakeImage();
  LeagueImage.mountLeagueImage({
    img: img,
    league: { id: 'b-rads-league', name: "B Rad's League" },
    load: loaderFor([], [])
  });

  // The slot is hidden and has no source; the league-name text (rendered
  // separately by the page) is untouched and remains the fallback.
  assert.ok(img.hasClass('hidden'));
  assert.equal(img.attributes.src, undefined);
  // alt is the accessible label even when the image is hidden.
  assert.equal(img.attributes.alt, "B Rad's League");
});

test('a loaded league image is shown with the league name as alt text', () => {
  const img = fakeImage();
  LeagueImage.mountLeagueImage({
    img: img,
    league: { id: 'nightfliers-random-dubs', name: 'Nightfliers Random Doubles 💥' },
    load: loaderFor(['league-images/nightfliers-random-dubs.webp'], [])
  });

  assert.equal(img.attributes.src, 'league-images/nightfliers-random-dubs.webp');
  assert.equal(img.attributes.alt, 'Nightfliers Random Doubles 💥');
  assert.ok(!img.hasClass('hidden'));
});

test('the sign-in page renders the image slot alongside the league-name text', () => {
  // The image slot lives in the header and starts hidden, so the page renders
  // text-only until a candidate loads.
  assert.match(SIGN_IN_HTML, /<img id="leagueImage" class="league-image hidden" alt="">/);
  // The existing league-name paragraph stays as the fallback and label.
  assert.match(SIGN_IN_HTML, /<p id="leagueIndicator" class="league-indicator"><\/p>/);
  // The module is loaded and the slot is wired on init.
  assert.match(SIGN_IN_HTML, /<script src="league-image\.js"><\/script>/);
  assert.match(SIGN_IN_HTML, /renderLeagueImage\(\);/);
  assert.match(SIGN_IN_HTML, /window\.LeagueImage\.mountLeagueImage\(\{/);
  // CSS constrains the image so it cannot shift the header on small screens.
  assert.match(SIGN_IN_HTML, /\.league-image\s*\{[^}]*max-height:\s*96px/);
});
